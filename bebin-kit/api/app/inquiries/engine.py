"""Inquiry state machine, scheduler and SSE hub (ARCHITECTURE §10).

    sent ─▶ delivered ─▶ seen ─▶ answered
      │         │          └───▶ no_answer   (deadline passed)
      └─────────┴──────────────▶ cancelled   (user)

Time: scheduling uses real epoch seconds. Displayed times are "virtual": real time plus the demo-clock offset
captured when the inquiry was created, so a demo at «۱۷:۴۰» shows replies at «۱۷:۵۲», not at the wall clock.
Every transition writes an `inquiry_events` row (its id is the SSE id) and is published to the hub."""
from __future__ import annotations

import asyncio
import heapq
import itertools
import json
import threading
import time
import uuid
from datetime import datetime, timedelta

from app.appdb import app_db
from app.config import get_settings
from app.hours import TEHRAN

ACTIVE = ("sent", "delivered", "seen")
TERMINAL = ("answered", "no_answer", "cancelled")
ORDER = {"sent": 0, "delivered": 1, "seen": 2, "answered": 3, "no_answer": 3, "cancelled": 3}
MANUAL_WINDOW_S = 60
MANUAL_DEADLINE_S = 600


# ---------------------------------------------------------------- settings the demo director can change
def speed() -> float:
    row = app_db().execute("SELECT value FROM demo_settings WHERE key='speed'").fetchone()
    return float(row["value"]) if row else get_settings().simulator_speed


def deadline_s() -> float:
    return get_settings().no_answer_timeout_s / max(speed(), 0.1)


def vtime(real: float, offset_s: float) -> str:
    return datetime.fromtimestamp(real + offset_s, TEHRAN).isoformat(timespec="seconds")


# ---------------------------------------------------------------- hub
class Hub:
    """In-memory pub/sub keyed by session and by shop. Safe to publish from worker threads."""

    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.sessions: dict[str, set[asyncio.Queue]] = {}
        self.shops: dict[str, set[asyncio.Queue]] = {}

    def subscribe(self, kind: str, key: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        (self.sessions if kind == "session" else self.shops).setdefault(key, set()).add(q)
        return q

    def unsubscribe(self, kind: str, key: str, q: asyncio.Queue) -> None:
        (self.sessions if kind == "session" else self.shops).get(key, set()).discard(q)

    def publish(self, session_id: str, shop_id: str, event: dict) -> None:
        targets = list(self.sessions.get(session_id, ())) + list(self.shops.get(shop_id, ()))
        for q in targets:
            self._put(q, event)

    def _put(self, q: asyncio.Queue, event: dict) -> None:
        def put():
            if not q.full():
                q.put_nowait(event)
        if self.loop and self.loop.is_running():
            try:
                if asyncio.get_running_loop() is self.loop:
                    put()
                    return
            except RuntimeError:
                pass
            self.loop.call_soon_threadsafe(put)


hub = Hub()


# ---------------------------------------------------------------- scheduler
class Scheduler:
    def __init__(self) -> None:
        self.heap: list[tuple[float, int, str, str]] = []
        self.seq = itertools.count()
        self.lock = threading.Lock()
        self.wake: asyncio.Event | None = None
        self.loop: asyncio.AbstractEventLoop | None = None

    def schedule(self, due: float, inquiry_id: str, action: str) -> None:
        with self.lock:
            heapq.heappush(self.heap, (due, next(self.seq), inquiry_id, action))
        if self.loop and self.wake:
            self.loop.call_soon_threadsafe(self.wake.set)

    def pop_due(self, now: float) -> list[tuple[str, str]]:
        out = []
        with self.lock:
            while self.heap and self.heap[0][0] <= now:
                _, _, iid, action = heapq.heappop(self.heap)
                out.append((iid, action))
        return out

    def run_due(self, now: float | None = None) -> int:
        """Apply every step that is due. Tests call this directly with a future `now`."""
        now = time.time() if now is None else now
        steps = self.pop_due(now)
        for iid, action in steps:
            apply(iid, action, now)
        return len(steps)

    async def run(self) -> None:
        self.loop = asyncio.get_running_loop()
        self.wake = asyncio.Event()
        while True:
            try:
                # In a worker thread: a step may call the LLM (seller wording) and must not block SSE.
                await asyncio.to_thread(self.run_due)
            except Exception:  # a bad step must not stop the loop
                pass
            with self.lock:
                nxt = self.heap[0][0] if self.heap else None
            timeout = 1.0 if nxt is None else max(0.02, min(1.0, nxt - time.time()))
            self.wake.clear()
            try:
                await asyncio.wait_for(self.wake.wait(), timeout)
            except asyncio.TimeoutError:
                pass

    def clear(self) -> None:
        with self.lock:
            self.heap.clear()


scheduler = Scheduler()


def rehydrate(now: float | None = None) -> int:
    """On startup: re-queue the pending steps of every active inquiry."""
    now = time.time() if now is None else now
    n = 0
    for r in app_db().execute(f"SELECT id, status, plan FROM inquiries WHERE status IN {ACTIVE}"):
        for due, action in json.loads(r["plan"] or "{}").get("steps", []):
            if action == "no_answer" or ORDER.get(_status_of(action), 9) > ORDER[r["status"]]:
                scheduler.schedule(max(due, now), r["id"], action)
                n += 1
    return n


def _status_of(action: str) -> str:
    return {"deliver": "delivered", "see": "seen", "answer": "answered", "no_answer": "no_answer"}[action]


# ---------------------------------------------------------------- persistence helpers
def get(inquiry_id: str):
    return app_db().execute("SELECT * FROM inquiries WHERE id=?", (inquiry_id,)).fetchone()


def _event(row, type_: str, payload: dict | None, real: float) -> int:
    con = app_db()
    cur = con.execute("INSERT INTO inquiry_events(inquiry_id, session_id, shop_id, type, payload, created_at) "
                      "VALUES (?,?,?,?,?,?)", (row["id"], row["session_id"], row["shop_id"], type_,
                                               json.dumps(payload or {}, ensure_ascii=False), vtime(real, row["offset_s"])))
    return cur.lastrowid


def _update(inquiry_id: str, real: float, **cols) -> None:
    row = get(inquiry_id)
    cols["updated_at"] = vtime(real, row["offset_s"])
    sets = ", ".join(f"{k}=?" for k in cols)
    app_db().execute(f"UPDATE inquiries SET {sets} WHERE id=?", (*cols.values(), inquiry_id))


def _emit(inquiry_id: str, type_: str, real: float, payload: dict | None = None) -> None:
    from app.inquiries.views import inquiry_out  # late import: views reads the catalog
    row = get(inquiry_id)
    ev_id = _event(row, type_, payload, real)
    hub.publish(row["session_id"], row["shop_id"],
                {"id": ev_id, "type": type_, "inquiry": inquiry_out(row).model_dump(mode="json")})


# ---------------------------------------------------------------- presence and overrides
def manual_mode(shop_id: str, real: float | None = None) -> bool:
    real = time.time() if real is None else real
    r = app_db().execute("SELECT last_seen_at FROM seller_presence WHERE shop_id=?", (shop_id,)).fetchone()
    return bool(r and real - r["last_seen_at"] <= MANUAL_WINDOW_S)


def touch_presence(shop_id: str, real: float | None = None) -> None:
    app_db().execute("INSERT INTO seller_presence(shop_id, last_seen_at) VALUES (?,?) ON CONFLICT(shop_id) "
                     "DO UPDATE SET last_seen_at=excluded.last_seen_at", (shop_id, time.time() if real is None else real))


def take_override(shop_id: str) -> str | None:
    con = app_db()
    r = con.execute("SELECT next_outcome FROM demo_overrides WHERE shop_id=?", (shop_id,)).fetchone()
    if r:
        con.execute("DELETE FROM demo_overrides WHERE shop_id=?", (shop_id,))
        return r["next_outcome"]
    return None


# ---------------------------------------------------------------- lifecycle
def create(session_id: str, shop_id: str, product_id: str | None, questions: list[str], detail: str | None,
           hold_until: str | None, note: str | None, ctx_at: datetime, real: float | None = None,
           buyer_distance_m: float | None = None) -> str:
    """Insert one inquiry and schedule its life. The simulator plans unless the seller is on the panel."""
    from app.inquiries import facts
    from app.inquiries.simulator import plan as sim_plan
    real = time.time() if real is None else real
    offset = ctx_at.timestamp() - real
    iid = uuid.uuid4().hex[:16]
    shop, offer = facts.load(shop_id, product_id, ctx_at)
    dl = deadline_s()
    manual = manual_mode(shop_id, real)
    settings = get_settings()
    steps: list[list] = []
    answer = None
    if manual or not settings.simulator_enabled:
        steps = [[real + 0.3, "deliver"], [real + MANUAL_DEADLINE_S, "no_answer"]]
        channel = "panel"
        dl = MANUAL_DEADLINE_S
    else:
        p = sim_plan(iid, questions, detail, hold_until, shop, offer, speed(), dl, take_override(shop_id))
        steps.append([real + p.deliver_after, "deliver"])
        if p.seen_after is not None:
            steps.append([real + p.seen_after, "see"])
        if p.answer_after is not None:
            steps.append([real + p.answer_after, "answer"])
            answer = p.answer
        steps.append([real + dl, "no_answer"])
        channel = "simulated"
    now_v = vtime(real, offset)
    app_db().execute(
        "INSERT INTO inquiries(id, session_id, shop_id, product_id, questions, detail, hold_until, note, status, "
        "channel, created_at, updated_at, deadline_at, offset_s, plan, ctx_at, tier, buyer_distance_m) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (iid, session_id, shop_id, product_id, json.dumps(questions), detail, hold_until, note, "sent", channel,
         now_v, now_v, vtime(real + dl, offset), offset, json.dumps({"steps": steps, "answer": answer}, ensure_ascii=False),
         ctx_at.isoformat(), "listed" if (offer and offer.listed) or not product_id else "related", buyer_distance_m))
    _emit(iid, "created", real)
    for due, action in steps:
        scheduler.schedule(due, iid, action)
    return iid


def apply(inquiry_id: str, action: str, real: float) -> bool:
    row = get(inquiry_id)
    if not row or row["status"] in TERMINAL:
        return False
    if action == "deliver" and row["status"] == "sent":
        _update(inquiry_id, real, status="delivered", delivered_at=vtime(real, row["offset_s"]))
        _emit(inquiry_id, "delivered", real)
        return True
    if action == "see" and ORDER[row["status"]] < ORDER["seen"]:
        _update(inquiry_id, real, status="seen", seen_at=vtime(real, row["offset_s"]),
                delivered_at=row["delivered_at"] or vtime(real, row["offset_s"]))
        _emit(inquiry_id, "seen", real)
        return True
    if action == "answer":
        if manual_mode(row["shop_id"], real):  # the seller took over: let them answer
            due = real + MANUAL_DEADLINE_S
            _update(inquiry_id, real, deadline_at=vtime(due, row["offset_s"]), channel="panel")
            scheduler.schedule(due, inquiry_id, "no_answer")
            return False
        answer = json.loads(row["plan"] or "{}").get("answer")
        if answer:
            from app.inquiries.wording import rephrase
            answer = {**answer, "message": rephrase(answer)}
            return record_answer(inquiry_id, answer, real)
        return False
    if action == "no_answer":
        deadline = datetime.fromisoformat(row["deadline_at"]).timestamp() - row["offset_s"] if row["deadline_at"] else real
        if real + 0.5 < deadline:  # a nudge moved the deadline; a newer step is queued
            return False
        _update(inquiry_id, real, status="no_answer")
        _emit(inquiry_id, "no_answer", real)
        return True
    return False


def record_answer(inquiry_id: str, answer: dict, real: float | None = None) -> bool:
    """An answer from the simulator or the seller panel: store it, verify the facts, notify."""
    real = time.time() if real is None else real
    row = get(inquiry_id)
    if not row or row["status"] in ("answered", "cancelled"):
        return False
    t = vtime(real, row["offset_s"])
    _update(inquiry_id, real, status="answered", answered_at=t, seen_at=row["seen_at"] or t,
            delivered_at=row["delivered_at"] or t, answer=json.dumps(answer, ensure_ascii=False), read_at=None)
    _verify(row, answer, t)
    _emit(inquiry_id, "answered", real)
    return True


FIELDS = ("price", "stock", "hours_today", "location", "installments")


def _verify(row, answer: dict, t: str) -> None:
    """Answer propagation (ARCHITECTURE §10): upsert verified facts; the latest wins."""
    con = app_db()
    pid = row["product_id"] or ""
    for f in FIELDS:
        if answer.get(f) is None:
            continue
        product_scoped = f in ("price", "stock")
        con.execute("INSERT INTO verifications(shop_id, product_id, field, value, detail, verified_at, inquiry_id) "
                    "VALUES (?,?,?,?,?,?,?) ON CONFLICT(shop_id, product_id, field) DO UPDATE SET value=excluded.value, "
                    "detail=excluded.detail, verified_at=excluded.verified_at, inquiry_id=excluded.inquiry_id",
                    (row["shop_id"], pid if product_scoped else "", f, str(answer[f]),
                     answer.get("stock_detail") if f == "stock" else None, t, row["id"]))


def nudge(inquiry_id: str, real: float | None = None) -> bool:
    """«یادآوری دوباره»: once per inquiry. Re-opens a no-answer and gives it a fresh, smaller chance."""
    from app.inquiries.simulator import rng
    real = time.time() if real is None else real
    row = get(inquiry_id)
    if not row or row["nudged"] or row["status"] in ("answered", "cancelled"):
        return False
    dl = deadline_s()
    status = "delivered" if row["status"] == "no_answer" else row["status"]
    _update(inquiry_id, real, status=status, nudged=1, deadline_at=vtime(real + dl, row["offset_s"]))
    _emit(inquiry_id, "nudged", real)
    plan = json.loads(row["plan"] or "{}")
    r = rng(inquiry_id + ":nudge")
    if row["channel"] == "simulated" and r.random() < 0.6:
        from app.inquiries import facts
        from app.inquiries.simulator import answer as sim_answer
        shop, offer = facts.load(row["shop_id"], row["product_id"], datetime.fromisoformat(row["ctx_at"]))
        if shop.open_state != "closed":
            plan["answer"] = plan.get("answer") or sim_answer(r, json.loads(row["questions"]), row["detail"],
                                                              row["hold_until"], shop, offer, None)
            app_db().execute("UPDATE inquiries SET plan=? WHERE id=?", (json.dumps(plan, ensure_ascii=False), inquiry_id))
            scheduler.schedule(real + r.uniform(4, 15) / speed(), inquiry_id, "see")
            scheduler.schedule(real + r.uniform(16, 40) / speed(), inquiry_id, "answer")
    scheduler.schedule(real + dl, inquiry_id, "no_answer")
    return True


def cancel(inquiry_id: str, real: float | None = None) -> bool:
    real = time.time() if real is None else real
    row = get(inquiry_id)
    if not row or row["status"] in TERMINAL:
        return False
    _update(inquiry_id, real, status="cancelled")
    _emit(inquiry_id, "cancelled", real)
    return True


def mark_read(inquiry_id: str, real: float | None = None) -> None:
    real = time.time() if real is None else real
    row = get(inquiry_id)
    if row and row["status"] in ("answered", "no_answer") and not row["read_at"]:
        app_db().execute("UPDATE inquiries SET read_at=? WHERE id=?", (vtime(real, row["offset_s"]), inquiry_id))


def seller_opened(shop_id: str, real: float | None = None) -> None:
    """The panel listed this shop's inbox: everything delivered is now seen."""
    real = time.time() if real is None else real
    touch_presence(shop_id, real)
    for r in app_db().execute("SELECT id FROM inquiries WHERE shop_id=? AND status IN ('sent','delivered')", (shop_id,)):
        apply(r["id"], "see", real)


def events_since(kind: str, key: str, last_id: int, limit: int = 100) -> list:
    col = "session_id" if kind == "session" else "shop_id"
    return app_db().execute(f"SELECT * FROM inquiry_events WHERE {col}=? AND id>? ORDER BY id LIMIT ?",
                            (key, last_id, limit)).fetchall()


def today_cutoff(now: datetime) -> str:
    """Verifications stay green only on the day they were made."""
    start = now.astimezone(TEHRAN).replace(hour=0, minute=0, second=0, microsecond=0)
    return (start - timedelta(seconds=0)).isoformat(timespec="seconds")
