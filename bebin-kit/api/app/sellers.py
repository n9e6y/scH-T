"""Sellers for a product (PRODUCT_SPEC F7, ARCHITECTURE §8): listed tier ranked, related tier separate."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from app import fa, freshness
from app.db import catalog
from app.geo import eta_min, haversine_m, route_km
from app.models import Components, RelatedRow, SellerRow, SellersOut, Stock, Warranty
from app.ranking import WEIGHTS, Candidate, rank
from app.views import open_status_view, payment_view, price_view, shop_ref

RELATED_RADIUS_KM = 5.0
RELATED_LIMIT = 8
RELATED_NOTE = "این فروشگاه‌ها در این دسته فعالیت دارند اما این کالا در فهرستشان ثبت نشده."
PAY_KEYS = ("installments", "torob_pay", "kala_barg")


def _arrival(at: datetime, origin, row, travel: str) -> tuple[float | None, float | None, float | None, datetime]:
    if not origin:
        return None, None, None, at
    d = haversine_m(origin[0], origin[1], row["lat"], row["lng"])
    rk = route_km(origin[0], origin[1], row["lat"], row["lng"])
    eta = eta_min(rk, travel)
    return d, rk, eta, at + timedelta(minutes=eta)


def sellers(product_id: str, at: datetime, lat: float | None = None, lng: float | None = None,
            mode: str = "balanced", travel: str = "walk", pay: list[str] | None = None, fast: bool = False,
            open_only: bool = False, radius: float | None = None) -> SellersOut | None:
    con = catalog()
    prod = con.execute("SELECT product_id, category FROM products WHERE product_id=?", (product_id,)).fetchone()
    if not prod:
        return None
    origin = (lat, lng) if lat is not None and lng is not None else None
    pay = [k for k in (pay or []) if k in PAY_KEYS]
    rows = con.execute("""SELECT o.offer_id, o.seller_title, o.price_toman, o.price_outlier, o.last_price_changed_at,
                                 o.warranty_raw, o.warranty_months, s.*
                          FROM offers o JOIN shops s USING(shop_id) WHERE o.product_id=?""", (product_id,)).fetchall()

    # One row per shop: the cheapest plausible offer wins.
    by_shop: dict[str, object] = {}
    for r in rows:
        cur = by_shop.get(r["shop_id"])
        val = r["price_toman"] if (r["price_toman"] and not r["price_outlier"]) else None
        cur_val = (cur["price_toman"] if (cur and cur["price_toman"] and not cur["price_outlier"]) else None)
        if cur is None or (val is not None and (cur_val is None or val < cur_val)):
            by_shop[r["shop_id"]] = r

    excluded_unknown: dict[str, int] = {}
    excluded_other = 0
    cands, ctx = [], {}
    for sid, r in by_shop.items():
        d, rk, eta, arrive = _arrival(at, origin, r, travel)
        st_arrive = open_status_view(r, arrive)
        fail_unknown, fail = None, False
        for k in pay:
            if r[k] != 1:
                fail = True
                fail_unknown = fail_unknown or (k if r[k] is None else None)
        if fast and r["fast_delivery"] != 1:
            fail = True
            fail_unknown = fail_unknown or ("fast_delivery" if r["fast_delivery"] is None else None)
        if open_only and st_arrive.state not in ("open", "closing_soon"):
            fail = True
            fail_unknown = fail_unknown or ("open" if st_arrive.state == "unknown" else None)
        if radius and origin and d is not None and d > radius * 1000:
            fail = True
        if fail:
            if fail_unknown:
                excluded_unknown[fail_unknown] = excluded_unknown.get(fail_unknown, 0) + 1
            else:
                excluded_other += 1
            continue
        price = price_view(r["price_toman"], r["last_price_changed_at"], r["price_outlier"])
        # Half-open when it closes within 30 minutes of arrival.
        open_state = st_arrive.state
        if open_state == "closing_soon" and (st_arrive.minutes_to_close or 0) > 30:
            open_state = "open"
        cands.append(Candidate(
            key=sid, price=price.value, price_kind=price.kind, freshness=price.freshness or "unknown",
            route_km=rk, open_state=open_state, closes_at=st_arrive.closes_at,
            installments=r["installments"], torob_pay=r["torob_pay"], warranty_months=r["warranty_months"],
            distance_m=d))
        ctx[sid] = (r, price, d, eta, st_arrive)

    scored = rank(cands, mode, has_location=origin is not None)
    listed = []
    for i, s in enumerate(scored, start=1):
        r, price, d, eta, st_arrive = ctx[s.candidate.key]
        listed.append(SellerRow(
            shop=shop_ref(r), offer_id=r["offer_id"], seller_title=r["seller_title"], price=price, stock=Stock(),
            distance_m=d, eta_min=eta, travel=travel, open_status=st_arrive, open_now=open_status_view(r, at),
            payment=payment_view(r), warranty=Warranty(months=r["warranty_months"], text=r["warranty_raw"]),
            score=s.score, components=Components(**s.components), reasons=s.reasons, rank=i))

    related = _related(prod["category"], set(by_shop), origin, at, travel, radius)
    return SellersOut(product_id=product_id, mode=mode if mode in WEIGHTS else "balanced",
                      weights=WEIGHTS.get(mode, WEIGHTS["balanced"]), travel=travel, has_location=origin is not None,
                      listed=listed, related=related, excluded_unknown=excluded_unknown,
                      excluded_other=excluded_other, related_note=RELATED_NOTE)


def _related(category: str, exclude: set[str], origin, at: datetime, travel: str,
             radius: float | None) -> list[RelatedRow]:
    """Shops whose business category matches but that don't list this product. Never priced."""
    like = f"%{json.dumps(category, ensure_ascii=False)}%"
    rows = catalog().execute("SELECT * FROM shops WHERE categories LIKE ? OR primary_category=?",
                             (like, category)).fetchall()
    limit_m = (radius or RELATED_RADIUS_KM) * 1000
    items = []
    for r in rows:
        if r["shop_id"] in exclude:
            continue
        d, rk, eta, arrive = _arrival(at, origin, r, travel)
        if origin and d > limit_m:
            continue
        st = open_status_view(r, arrive)
        items.append((d if d is not None else -r["offer_count"], st, r, eta))
    order = {"open": 0, "closing_soon": 1, "unknown": 2, "closed": 3}
    items.sort(key=lambda x: (order[x[1].state], x[0]))
    out = []
    for d, st, r, eta in items[:RELATED_LIMIT]:
        reasons = ["همین دسته‌ی کالا"]
        if origin:
            reasons.insert(0, f"{fa.distance(d)} تا اینجا")
        if st.state == "open" and st.closes_at:
            reasons.append(f"تا {fa.digits(st.closes_at)} باز است")
        out.append(RelatedRow(shop=shop_ref(r), distance_m=d if origin else None, eta_min=eta, open_status=st,
                              payment=payment_view(r), reasons=reasons[:3], note=RELATED_NOTE))
    return out


def freshness_rank(tier: str) -> int:
    return freshness.RANK.get(tier, 0)
