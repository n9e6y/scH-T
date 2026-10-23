"""Store pages (F8) and malls (F9)."""
from __future__ import annotations

import json
from datetime import datetime

from app import fa
from app.db import catalog
from app.geo import bbox, eta_min, haversine_m, route_km
from app.hours import weekday_index
from app.models import (HoursDay, MallDetail, MallFloor, MallNear, MallShop, ShopDetail, ShopOffer, ShopOffersOut,
                        ShopVerification)
from app.text import normalize_fa
from app.views import first_image, open_status_view, payment_view, price_view, shop_ref, week_of

PAGE_SIZE = 20
UNKNOWN_FLOOR = "طبقه ثبت نشده"


def shop_detail(shop_id: str, at: datetime, lat: float | None = None, lng: float | None = None) -> ShopDetail | None:
    r = catalog().execute("SELECT * FROM shops WHERE shop_id=?", (shop_id,)).fetchone()
    if not r:
        return None
    week = week_of(r)
    today = weekday_index(at)
    hours = None
    if week:
        hours = [HoursDay(weekday=d, weekday_fa=fa.WEEKDAYS_FA[d],
                          ranges=None if d not in week else [
                              f"{a // 60:02d}:{a % 60:02d}–{(b % 1440) // 60:02d}:{b % 60:02d}" for a, b in week[d]],
                          is_today=d == today) for d in range(7)]
    return ShopDetail(shop=shop_ref(r), categories=json.loads(r["categories"] or "[]"), address=r["address"],
                      open_status=open_status_view(r, at), hours=hours, payment=payment_view(r), phone=r["phone"],
                      instagram=r["instagram"], website=r["website"], offer_count=r["offer_count"],
                      verifications=shop_verifications(shop_id, at), **_trip(lat, lng, r["lat"], r["lng"]))


def shop_verifications(shop_id: str, at: datetime) -> list[ShopVerification]:
    """«تأییدهای اخیر»: green only on the day they were made, then «قدیمی شده»."""
    from app import verify
    from app.inquiries.views import hm
    out = []
    cutoff = verify.day_start(at)
    con = catalog()
    for v in verify.for_shop(shop_id):
        name = ""
        if v["product_id"]:
            p = con.execute("SELECT title_fa, model FROM products WHERE product_id=?", (v["product_id"],)).fetchone()
            name = (p["model"] or p["title_fa"]) if p else ""
        today = v["verified_at"] >= cutoff
        when = hm(v["verified_at"]) if today else (fa.jalali(v["verified_at"]) + "، قدیمی شده")
        f, val = v["field"], v["value"]
        if f == "price":
            text, value = f"قیمت {name} تأیید شد، {when}", fa.number(int(val))
        elif f == "stock":
            what = f"{name} {fa.digits(v['detail'])}".strip() if v["detail"] else name
            text, value = (f"موجودی {what} تأیید شد، {when}" if val == "in_stock" else f"ناموجود بودن {what}، {when}"), None
        elif f == "location":
            text, value = f"جای دقیق: {val}، {when}", None
        elif f == "hours_today":
            text, value = f"ساعت امروز: {val}، {when}", None
        else:
            text, value = f"اقساط: {val}، {when}", None
        out.append(ShopVerification(text=text, value=value, verified_at=v["verified_at"], today=today))
    return out


def shop_offers(shop_id: str, q: str = "", page: int = 1) -> ShopOffersOut:
    sql = ("SELECT o.offer_id, o.price_toman, o.price_outlier, o.last_price_changed_at, p.product_id, p.title_fa, "
           "p.image_urls FROM offers o JOIN products p USING(product_id) WHERE o.shop_id=?")
    args: list = [shop_id]
    if q.strip():
        sql += " AND p.search_text LIKE ?"
        args.append(f"%{normalize_fa(q)}%")
    rows = catalog().execute(sql + " ORDER BY o.last_price_changed_at DESC", args).fetchall()
    start = (page - 1) * PAGE_SIZE
    items = [ShopOffer(product_id=r["product_id"], offer_id=r["offer_id"], title=r["title_fa"],
                       image=first_image(r["image_urls"]),
                       price=price_view(r["price_toman"], r["last_price_changed_at"], r["price_outlier"]))
             for r in rows[start:start + PAGE_SIZE]]
    return ShopOffersOut(items=items, total=len(rows), page=page, has_more=start + PAGE_SIZE < len(rows))


def mall_detail(mall_id: int, at: datetime, lat: float | None = None, lng: float | None = None) -> MallDetail | None:
    con = catalog()
    m = con.execute("SELECT * FROM malls WHERE mall_id=?", (mall_id,)).fetchone()
    if not m:
        return None
    floors: dict[tuple, list[MallShop]] = {}
    open_count = 0
    for r in con.execute("SELECT * FROM shops WHERE mall_id=?", (mall_id,)):
        st = open_status_view(r, at)
        open_count += st.state in ("open", "closing_soon")
        key = (r["floor_order"], r["floor_label"] or UNKNOWN_FLOOR)
        floors.setdefault(key, []).append(MallShop(id=r["shop_id"], name=r["name"], unit=r["unit"], open_status=st,
                                                   primary_category=r["primary_category"]))
    ordered = sorted(floors.items(), key=lambda kv: (kv[0][0] is None, kv[0][0] if kv[0][0] is not None else 0))
    out_floors = []
    for (order, label), shops in ordered:
        shops.sort(key=lambda s: (s.unit is None, _unit_key(s.unit), s.name))
        out_floors.append(MallFloor(floor_label=label, floor_order=order, shops=shops))
    return MallDetail(id=m["mall_id"], name=m["name"], address=m["address"], area=m["area"], lat=m["lat"],
                      lng=m["lng"], shop_count=m["shop_count"], open_count=open_count, floors=out_floors,
                      **_trip(lat, lng, m["lat"], m["lng"]))


def _trip(lat, lng, to_lat, to_lng) -> dict:
    """Straight-line distance and walking ETA from the user, when we know where they are."""
    if lat is None or lng is None:
        return {}
    return {"distance_m": haversine_m(lat, lng, to_lat, to_lng), "eta_min": eta_min(route_km(lat, lng, to_lat, to_lng), "walk")}


def _unit_key(unit: str | None):
    if not unit:
        return (1, 0, "")
    digits = "".join(ch for ch in unit if ch.isdigit())
    return (0, int(digits) if digits else 0, unit)


def malls_near(lat: float, lng: float, at: datetime, limit: int = 8, radius_km: float = 5.0,
               min_shops: int = 3) -> list[MallNear]:
    con = catalog()
    a, b, c, d = bbox(lat, lng, radius_km)
    malls = con.execute("SELECT * FROM malls WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND shop_count>=?",
                        (a, b, c, d, min_shops)).fetchall()
    ranked = sorted(malls, key=lambda m: haversine_m(lat, lng, m["lat"], m["lng"]))[:limit]
    out = []
    for m in ranked:
        open_count = 0
        for r in con.execute("SELECT hours_json FROM shops WHERE mall_id=?", (m["mall_id"],)):
            open_count += open_status_view(r, at).state in ("open", "closing_soon")
        rk = route_km(lat, lng, m["lat"], m["lng"])
        out.append(MallNear(id=m["mall_id"], name=m["name"], area=m["area"], lat=m["lat"], lng=m["lng"],
                            shop_count=m["shop_count"], open_count=open_count,
                            distance_m=haversine_m(lat, lng, m["lat"], m["lng"]), eta_min=eta_min(rk, "walk")))
    return out
