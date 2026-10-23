"""Visit plan (PRODUCT_SPEC F12, ARCHITECTURE §12 POST /plan). Orders stops, groups shops of the same mall into
one stop, estimates legs and arrival, and computes open status *at arrival* (not now). Pure apart from catalog
reads; the trust states map 1:1 to the OpenStatus visuals."""
from __future__ import annotations

from datetime import datetime, timedelta

from app import fa, verify
from app.db import catalog
from app.geo import eta_min, haversine_m, route_km
from app.hours import TEHRAN, open_status, weekday_index
from app.inquiries.views import product_ref
from app.models import PlanAlt, PlanIn, PlanOut, PlanStopOut, PlanSub
from app.views import week_of

STAY_MALL, STAY_SHOP = 15, 10
WEEKDAYS = fa.WEEKDAYS_FA


def hm(dt: datetime) -> str:
    return fa.digits(dt.strftime("%H:%M"))


def _order(points: list[tuple[str, float, float]], start: tuple[float, float] | None) -> list[str]:
    """Greedy nearest-first from the start point (good enough for ≤8 stops on foot)."""
    if not start:
        return [p[0] for p in points]
    left, cur, out = list(points), start, []
    while left:
        nxt = min(left, key=lambda p: haversine_m(cur[0], cur[1], p[1], p[2]))
        out.append(nxt[0])
        cur = (nxt[1], nxt[2])
        left.remove(nxt)
    return out


def _status(week, start: datetime, arrive: datetime) -> tuple[str, str]:
    now = open_status(week, start)
    if now.state == "unknown":
        return "unknown", "ساعت کاری نامشخص؛ قبل از رفتن بپرس"
    if now.state == "closed":
        when = ""
        if now.opens_at:
            day = "فردا" if now.opens_at["days_ahead"] == 1 else WEEKDAYS[now.opens_at["weekday"]]
            when = f"؛ {day} {fa.digits(now.opens_at['time'])} باز می‌شود" if now.opens_at["days_ahead"] else f"؛ {fa.digits(now.opens_at['time'])} باز می‌شود"
        return "closed_now", f"الان بسته است{when}"
    at = open_status(week, arrive)
    closes = now.closes_at
    if at.state not in ("open", "closing_soon"):
        return "closed_on_arrival", f"وقتی برسی بسته است (تا {fa.digits(closes)})" if closes else "وقتی برسی بسته است"
    if at.closes_at:
        h, m = map(int, at.closes_at.split(":"))
        left = (h * 60 + m) - (arrive.hour * 60 + arrive.minute)
        if 0 < left < 20:
            return "closing", f"وقتی برسی فقط {fa.digits(left)} دقیقه تا بستن مانده"
        return "open", f"وقتی برسی باز است، تا {fa.digits(at.closes_at)}"
    return "open", "وقتی برسی باز است"


def plan(body: PlanIn, now: datetime, demo_clock: bool) -> PlanOut:
    con = catalog()
    start_at = datetime.fromisoformat(body.start_at).astimezone(TEHRAN) if body.start_at else now
    start = (body.lat, body.lng) if body.lat is not None and body.lng is not None else None
    rows = {}
    for s in body.stops:
        r = con.execute("SELECT * FROM shops WHERE shop_id=?", (s.shop_id,)).fetchone()
        if r:
            rows[s.shop_id] = (r, s.product_id)
    # Group by mall: one stop per mall, one per standalone shop.
    groups: dict[str, list] = {}
    for sid, (r, pid) in rows.items():
        groups.setdefault(f"mall:{r['mall_id']}" if r["mall_id"] else sid, []).append((r, pid))
    points = [(k, g[0][0]["lat"], g[0][0]["lng"]) for k, g in groups.items()]
    given = [k for k in dict.fromkeys(f"mall:{rows[s.shop_id][0]['mall_id']}" if rows.get(s.shop_id) and rows[s.shop_id][0]["mall_id"]
                                      else s.shop_id for s in body.stops) if k in groups]
    order = _order(points, start) if body.optimize else given
    verified = {}
    for g in groups.values():
        for r, pid in g:
            if pid:
                verified.setdefault(pid, verify.for_product(pid, now))
    t, cur, stops, warn, shop_n = start_at, start, [], 0, 0
    plan_ids = set(rows)
    for i, key in enumerate(order):
        g = groups[key]
        r0 = g[0][0]
        dist = route_km(cur[0], cur[1], r0["lat"], r0["lng"]) if cur else None
        leg_min = max(1, round(eta_min(dist, body.mode))) if dist is not None else 0
        t = t + timedelta(minutes=leg_min)
        arrive = t
        status, text = _status(week_of(r0) if r0["hours_json"] else None, start_at, arrive)
        stay = 0 if status in ("closed_now", "closed_on_arrival") else (STAY_MALL if key.startswith("mall:") else STAY_SHOP)
        if status in ("closed_now", "closed_on_arrival"):
            warn += 1
        t = t + timedelta(minutes=stay)
        cur = (r0["lat"], r0["lng"])
        subs = []
        for r, pid in g:
            shop_n += 1
            prod = product_ref(pid) if pid else None
            v = verified.get(pid, {}).get(r["shop_id"], {}) if pid else {}
            ver = None
            if "stock" in v and v["stock"]["value"] == "in_stock":
                ver = f"{'موجود' + (' ' + fa.digits(v['stock']['detail']) if v['stock']['detail'] else '')}، تأیید {hm(datetime.fromisoformat(v['stock']['verified_at']))}"
            elif "price" in v:
                ver = f"{fa.number(int(v['price']['value']))} تومان، تأیید {hm(datetime.fromisoformat(v['price']['verified_at']))}"
            old = None
            if pid and not ver:
                lv = verify.latest(r["shop_id"], pid)
                if lv:
                    t_old = datetime.fromisoformat(lv["verified_at"]).astimezone(TEHRAN)
                    old = f"تأیید {WEEKDAYS[weekday_index(t_old)]} {hm(t_old)}، قدیمی شده"
            unit = fa.digits("، ".join(x for x in (r["floor_label"], f"واحد {r['unit']}" if r["unit"] else None) if x)) or None
            subs.append(PlanSub(shop_id=r["shop_id"], name=r["name"], unit=unit,
                                item=(prod.model or prod.title) if prod else None, verified=ver, verified_old=old))
        if key.startswith("mall:"):
            title = r0["mall_name"]
            place = fa.digits(f"{r0['area'] or r0['address_short'] or ''}، {len(g)} فروشگاه در همین پاساژ").strip("، ")
        else:
            title = r0["name"]
            place = fa.digits(r0["address_short"] or r0["area"] or "")
        alt = None
        pid0 = next((pid for _, pid in g if pid), None)
        if status in ("closed_now", "closed_on_arrival") and pid0:
            from app.sellers import sellers as sellers_of
            out = sellers_of(pid0, arrive, cur[0], cur[1], "balanced", body.mode)
            cand = next((x for x in (out.listed if out else []) if x.shop.id not in plan_ids
                         and x.open_status.state in ("open", "closing_soon")), None)
            if cand:
                bits = ["همین مدل"]
                if cand.price.value:
                    bits.append(f"{fa.number(cand.price.value)} تومان")
                if cand.distance_m is not None:
                    bits.append(fa.distance(cand.distance_m))
                if cand.open_status.closes_at:
                    bits.append(f"تا {fa.digits(cand.open_status.closes_at)} باز است (ثبت‌شده)")
                alt = PlanAlt(shop_id=cand.shop.id, name=cand.shop.name, reason="، ".join(bits), product_id=pid0)
        leg = (f"از {body.start_label}، " if i == 0 and body.start_label else "") + (
            f"{fa.digits(leg_min)} دقیقه {'پیاده' if body.mode == 'walk' else 'با ماشین'}، تخمینی" if dist is not None else "فاصله نامشخص؛ موقعیتت را انتخاب کن")
        stops.append(PlanStopOut(
            key=key, shop_ids=[r["shop_id"] for r, _ in g], title=title, place=place, lat=r0["lat"], lng=r0["lng"],
            leg=leg, arrive=f"رسیدن {hm(arrive)}" + (f"، ماندن حدود {fa.digits(stay)} دقیقه" if stay else ""),
            status=status, status_text=text, subs=subs, alternative=alt, can_ask=status == "unknown"))
    day = "" if start_at.date() == now.date() else f"{WEEKDAYS[weekday_index(start_at)]}، "
    start_text = f"{'از ' + body.start_label + '، ' if body.start_label else ''}{day}ساعت {hm(start_at)}"
    banner = banner_at = banner_label = None
    if warn >= 2:
        nxt = (start_at + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        banner_label = f"برای {WEEKDAYS[weekday_index(nxt)]} ۱۰:۰۰ بچین"
        banner_at = nxt.isoformat()
        banner = f"{fa.digits(warn)} توقف وقتی برسی بسته است. برنامه را برای {WEEKDAYS[weekday_index(nxt)]} صبح بچینم یا جایگزین‌ها را بگذارم؟"
    nav = None
    if stops:
        travel = "walking" if body.mode == "walk" else "driving"
        dest = f"{stops[-1].lat},{stops[-1].lng}"
        way = "|".join(f"{s.lat},{s.lng}" for s in stops[:-1])
        nav = f"https://www.google.com/maps/dir/?api=1&destination={dest}&travelmode={travel}" + (f"&waypoints={way}" if way else "") + (
            f"&origin={start[0]},{start[1]}" if start else "")
    return PlanOut(
        start_text=start_text, stops=stops, end_text=f"تا {hm(t)} تمام می‌شود", end_short=f"پایان، حدود {hm(t)}",
        meta=f"{fa.digits(len(stops))} توقف، {fa.digits(shop_n)} فروشگاه", warnings=warn, banner=banner,
        banner_start_at=banner_at, banner_start_label=banner_label,
        footer_title=f"{fa.digits(warn)} توقف مشکل دارد" if warn else "همه‌ی توقف‌ها وقتی برسی باز هستند",
        footer_sub="اول جایگزین کن، بعد شروع کن" if warn else "ساعت‌ها تخمینی است", nav_url=nav, demo_clock=demo_clock)
