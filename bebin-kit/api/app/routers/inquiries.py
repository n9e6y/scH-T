"""Ask the store (PRODUCT_SPEC F10/F11/F15/F16): inquiries, SSE, alternatives, seller panel, demo director."""
from __future__ import annotations

import asyncio
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app import clock
from app.appdb import app_db
from app.config import get_settings
from app.db import catalog
from app.geo import haversine_m
from app.inquiries import engine, facts
from app.inquiries.alternatives import alternatives as alternatives_of
from app.inquiries.views import compose as compose_view
from app.inquiries.views import inquiry_out, product_ref, seller_shop
from app.models import (AlternativesOut, ComposeOut, ComposeRecipient, DemoOverrideIn, DemoState, InquiriesOut,
                        InquiryGroup, InquiryIn, InquiryOut, PlanIn, PlanOut, SellerInboxItem, SellerInboxOut, SellerReplyIn,
                        SellerShop)
from app.sellers import sellers as sellers_of
from app.text import normalize_fa
from app.views import open_status_view

router = APIRouter()
PayKey = Literal["installments", "torob_pay", "kala_barg"]


def _session(x_session_id: str | None) -> str:
    if not x_session_id or len(x_session_id) > 64:
        raise HTTPException(400, {"code": "no_session", "message_fa": "نشست مشخص نیست؛ صفحه را دوباره باز کن."})
    return x_session_id


def _own(inquiry_id: str, session_id: str):
    row = engine.get(inquiry_id)
    if not row or row["session_id"] != session_id:
        raise HTTPException(404, {"code": "not_found", "message_fa": "این پیگیری پیدا نشد."})
    return row


# ---------------------------------------------------------------- shopper
@router.get("/inquiries/compose", response_model=ComposeOut)
def compose(request: Request, shop_ids: Annotated[list[str], Query(min_length=1, max_length=5)],
            product_id: str | None = None, preset: Annotated[list[str], Query()] = [],
            lat: float | None = None, lng: float | None = None):
    at = clock.now(request)
    alts: list[ComposeRecipient] = []
    if product_id and len(shop_ids) == 1:
        s = facts.shop_row(shop_ids[0])
        if s and open_status_view(s, at).state == "closed":
            out = sellers_of(product_id, at, lat, lng)
            alts = [ComposeRecipient(id=r.shop.id, name=r.shop.name, open_now=r.open_now) for r in (out.listed if out else [])
                    if r.shop.id not in shop_ids and r.open_now.state in ("open", "closing_soon")][:3]
    return compose_view(shop_ids, product_id, preset, at, alts)


@router.post("/inquiries", response_model=list[InquiryOut])
def create(request: Request, body: InquiryIn, x_session_id: Annotated[str | None, Header()] = None):
    sid = _session(x_session_id)
    at = clock.now(request)
    con = catalog()
    ids = []
    for shop_id in dict.fromkeys(body.shop_ids):
        s = con.execute("SELECT lat, lng FROM shops WHERE shop_id=?", (shop_id,)).fetchone()
        if not s:
            continue
        dist = haversine_m(body.lat, body.lng, s["lat"], s["lng"]) if body.lat is not None and body.lng is not None else None
        ids.append(engine.create(sid, shop_id, body.product_id, list(body.questions), body.detail, body.hold_until,
                                 body.note, at, buyer_distance_m=dist))
    if not ids:
        raise HTTPException(404, {"code": "not_found", "message_fa": "فروشگاه پیدا نشد."})
    return [inquiry_out(engine.get(i)) for i in ids]


@router.get("/inquiries", response_model=InquiriesOut)
def list_inquiries(x_session_id: Annotated[str | None, Header()] = None, shop: str | None = None):
    sid = _session(x_session_id)
    q = "SELECT * FROM inquiries WHERE session_id=?" + (" AND shop_id=?" if shop else "") + " ORDER BY created_at DESC LIMIT 100"
    rows = app_db().execute(q, (sid, shop) if shop else (sid,)).fetchall()
    items = [inquiry_out(r) for r in rows]
    groups: dict[str, InquiryGroup] = {}
    for it in items:
        key = it.product.id if it.product else f"shop:{it.shop.id}"
        groups.setdefault(key, InquiryGroup(product=it.product, items=[])).items.append(it)
    counts = {"all": len(items), "waiting": sum(i.outcome == "waiting" for i in items),
              "answered": sum(i.outcome in ("answered", "out_of_stock") for i in items),
              "no_answer": sum(i.outcome == "no_answer" for i in items)}
    return InquiriesOut(groups=list(groups.values()), unread=sum(i.unread for i in items), counts=counts)


@router.get("/inquiries/{inquiry_id}", response_model=InquiryOut)
def get_inquiry(inquiry_id: str, x_session_id: Annotated[str | None, Header()] = None):
    return inquiry_out(_own(inquiry_id, _session(x_session_id)))


@router.post("/inquiries/{inquiry_id}/{action}", response_model=InquiryOut)
def inquiry_action(inquiry_id: str, action: Literal["nudge", "cancel", "read"],
                   x_session_id: Annotated[str | None, Header()] = None):
    _own(inquiry_id, _session(x_session_id))
    {"nudge": engine.nudge, "cancel": engine.cancel, "read": engine.mark_read}[action](inquiry_id)
    return inquiry_out(engine.get(inquiry_id))


@router.get("/alternatives", response_model=AlternativesOut)
def alternatives(request: Request, product_id: str, failed: Annotated[list[str], Query()] = [],
                 lat: float | None = None, lng: float | None = None, pay: Annotated[list[PayKey], Query()] = []):
    return alternatives_of(product_id, list(failed), clock.now(request), lat, lng, list(pay))


# ---------------------------------------------------------------- SSE
def _sse(ev_id: int, type_: str, data: dict) -> str:
    return f"id: {ev_id}\nevent: {type_}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream(request: Request, kind: str, key: str, last_id: int, tick=None):
    q = engine.hub.subscribe(kind, key)
    try:
        # Replay what was missed, collapsed to the latest state of each inquiry.
        latest: dict[str, int] = {}
        for ev in engine.events_since(kind, key, last_id, 500):
            latest[ev["inquiry_id"]] = ev["id"]
        for iid, ev_id in sorted(latest.items(), key=lambda x: x[1]):
            row = engine.get(iid)
            if row:
                yield _sse(ev_id, "replay", {"id": ev_id, "type": "replay", "inquiry": inquiry_out(row).model_dump(mode="json")})
        yield ": connected\n\n"
        while not await request.is_disconnected():
            try:
                ev = await asyncio.wait_for(q.get(), 15)
                yield _sse(ev["id"], ev["type"], ev)
            except asyncio.TimeoutError:
                if tick:
                    tick()
                yield ": ping\n\n"
    finally:
        engine.hub.unsubscribe(kind, key, q)


SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}


@router.get("/events")
async def events(request: Request, session_id: str, last_event_id: Annotated[str | None, Header()] = None,
                 since: int = 0):
    last = int(last_event_id) if last_event_id and last_event_id.isdigit() else since
    return StreamingResponse(_stream(request, "session", session_id, last), media_type="text/event-stream",
                             headers=SSE_HEADERS)


# ---------------------------------------------------------------- seller panel
@router.get("/seller/shops", response_model=list[SellerShop])
def seller_shops(q: str = "", limit: int = Query(12, ge=1, le=40)):
    con = catalog()
    new = {r["shop_id"]: r["n"] for r in app_db().execute(
        "SELECT shop_id, count(*) n FROM inquiries WHERE status IN ('sent','delivered','seen') GROUP BY shop_id")}
    if q.strip():
        raw, norm = f"%{q.strip()}%", f"%{normalize_fa(q.strip())}%"
        rows = con.execute("SELECT * FROM shops WHERE name LIKE ? OR name LIKE ? OR coalesce(mall_name,'') LIKE ? "
                           "ORDER BY offer_count DESC LIMIT ?", (raw, norm, raw, limit)).fetchall()
    else:
        recent = [r["shop_id"] for r in app_db().execute(
            "SELECT shop_id, max(created_at) t FROM inquiries GROUP BY shop_id ORDER BY t DESC LIMIT ?", (limit,))]
        rows = [con.execute("SELECT * FROM shops WHERE shop_id=?", (i,)).fetchone() for i in recent]
        rows = [r for r in rows if r]
        if len(rows) < limit:
            have = {r["shop_id"] for r in rows}
            rows += [r for r in con.execute("SELECT * FROM shops ORDER BY offer_count DESC LIMIT ?", (limit,))
                     if r["shop_id"] not in have][:limit - len(rows)]
    return [seller_shop(r, new.get(r["shop_id"], 0)) for r in rows]


@router.get("/seller/inbox", response_model=SellerInboxOut)
def seller_inbox(request: Request, shop_id: str):
    s = facts.shop_row(shop_id)
    if not s:
        raise HTTPException(404, {"code": "not_found", "message_fa": "فروشگاه پیدا نشد."})
    engine.seller_opened(shop_id)
    rows = app_db().execute("SELECT * FROM inquiries WHERE shop_id=? ORDER BY created_at DESC LIMIT 60", (shop_id,)).fetchall()
    at = clock.now(request)
    shop, _ = facts.load(shop_id, None, at)
    closes = int((shop.closes_at or "21:00").split(":")[0])
    hours = [f"{h:02d}:00" for h in sorted({closes - 1, closes, min(closes + 1, 23), 22}) if 8 <= h <= 23][:4]
    new, answered = [], []
    for r in rows:
        out = inquiry_out(r)
        if r["status"] in ("sent", "delivered", "seen"):
            o = facts.offer_row(shop_id, r["product_id"]) if r["product_id"] else None
            price = o["price_toman"] if (o and o["price_toman"] and not o["price_outlier"]) else None
            loc = None
            if s["mall_name"] and s["floor_label"]:
                loc = f"{s['floor_label']}، واحد {s['unit']}" if s["unit"] else s["floor_label"]
            new.append(SellerInboxItem(inquiry=out, prefill_price=price, prefill_location=loc, hour_options=hours))
        elif r["status"] == "answered":
            answered.append(out)
    return SellerInboxOut(shop=seller_shop(s, len(new)), new=new, answered=answered[:20])


@router.post("/seller/presence")
def seller_presence(shop_id: str):
    engine.touch_presence(shop_id)
    return {"ok": True}


@router.post("/seller/inquiries/{inquiry_id}/reply", response_model=InquiryOut)
def seller_reply(inquiry_id: str, body: SellerReplyIn):
    row = engine.get(inquiry_id)
    if not row:
        raise HTTPException(404, {"code": "not_found", "message_fa": "این پیام پیدا نشد."})
    if row["status"] in ("answered", "cancelled"):
        raise HTTPException(409, {"code": "closed", "message_fa": "این پیام قبلاً جواب داده شده یا لغو شده."})
    engine.touch_presence(row["shop_id"])
    answer = {k: v for k, v in body.model_dump().items() if v not in (None, "")}
    answer["simulated"] = False
    engine.record_answer(inquiry_id, answer)
    return inquiry_out(engine.get(inquiry_id))


@router.get("/seller/events")
async def seller_events(request: Request, shop_id: str, last_event_id: Annotated[str | None, Header()] = None,
                        since: int = 0):
    engine.touch_presence(shop_id)
    last = int(last_event_id) if last_event_id and last_event_id.isdigit() else since
    return StreamingResponse(_stream(request, "shop", shop_id, last, tick=lambda: engine.touch_presence(shop_id)),
                             media_type="text/event-stream", headers=SSE_HEADERS)


# ---------------------------------------------------------------- visit plan (F12)
@router.post("/plan", response_model=PlanOut)
def visit_plan(request: Request, body: PlanIn):
    from app.planner import plan
    return plan(body, clock.now(request), bool(request.headers.get("x-demo-clock")))


# ---------------------------------------------------------------- demo director (F16)
def _demo_guard():
    if not get_settings().demo_director_enabled:
        raise HTTPException(403, {"code": "disabled", "message_fa": "کارگردان نمایش خاموش است."})


@router.get("/demo", response_model=DemoState)
def demo_state():
    return DemoState(enabled=get_settings().demo_director_enabled, speed=engine.speed(),
                     overrides={r["shop_id"]: r["next_outcome"] for r in app_db().execute("SELECT * FROM demo_overrides")})


@router.post("/demo/override", response_model=DemoState)
def demo_override(body: DemoOverrideIn):
    _demo_guard()
    if body.outcome:
        app_db().execute("INSERT INTO demo_overrides(shop_id, next_outcome) VALUES (?,?) ON CONFLICT(shop_id) "
                         "DO UPDATE SET next_outcome=excluded.next_outcome", (body.shop_id, body.outcome))
    else:
        app_db().execute("DELETE FROM demo_overrides WHERE shop_id=?", (body.shop_id,))
    return demo_state()


@router.post("/demo/speed", response_model=DemoState)
def demo_speed(speed: float = Query(ge=0.25, le=20)):
    _demo_guard()
    app_db().execute("INSERT INTO demo_settings(key, value) VALUES ('speed', ?) ON CONFLICT(key) DO UPDATE SET "
                     "value=excluded.value", (str(speed),))
    return demo_state()
