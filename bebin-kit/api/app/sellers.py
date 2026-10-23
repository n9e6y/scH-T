"""Sellers for a product (PRODUCT_SPEC F7, ARCHITECTURE §8): listed tier ranked, related tier separate."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from app import fa, freshness
from app.db import catalog
from app.geo import eta_min, haversine_m, route_km
from app import verify
from app.models import Components, Price, RelatedRow, SellerRow, SellersOut, Stock, Warranty
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
            open_only: bool = False, radius: float | None = None, include_unknown: bool = False) -> SellersOut | None:
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
    verified = verify.for_product(product_id, at)
    for sid, r in by_shop.items():
        d, rk, eta, arrive = _arrival(at, origin, r, travel)
        st_arrive = open_status_view(r, arrive)
        # Known facts that fail drop the row; missing data drops it unless the user asked to see unknowns.
        hard, unknown = False, []
        for k in pay:
            if r[k] is None:
                unknown.append(k)
            elif r[k] != 1:
                hard = True
        if fast:
            if r["fast_delivery"] is None:
                unknown.append("fast_delivery")
            elif r["fast_delivery"] != 1:
                hard = True
        if open_only:
            if st_arrive.state == "unknown":
                unknown.append("open")
            elif st_arrive.state not in ("open", "closing_soon"):
                hard = True
        if radius and origin and d is not None and d > radius * 1000:
            hard = True
        if hard:
            excluded_other += 1
            continue
        if unknown and not include_unknown:
            excluded_unknown[unknown[0]] = excluded_unknown.get(unknown[0], 0) + 1
            continue
        price = price_view(r["price_toman"], r["last_price_changed_at"], r["price_outlier"])
        stock = Stock()
        v = verified.get(sid, {})
        if "price" in v:
            price = Price(value=int(v["price"]["value"]), kind="verified", freshness=price.freshness,
                          changed_at=price.changed_at, verified_at=v["price"]["verified_at"], listed_value=price.value)
        if "stock" in v:
            stock = Stock(state=v["stock"]["value"], verified_at=v["stock"]["verified_at"], note=v["stock"]["detail"])
        # Half-open when it closes within 30 minutes of arrival.
        open_state = st_arrive.state
        if open_state == "closing_soon" and (st_arrive.minutes_to_close or 0) > 30:
            open_state = "open"
        cands.append(Candidate(
            key=sid, price=price.value, price_kind=price.kind, freshness=price.freshness or "unknown",
            route_km=rk, open_state=open_state, closes_at=st_arrive.closes_at,
            installments=r["installments"], torob_pay=r["torob_pay"], warranty_months=r["warranty_months"],
            distance_m=d, stock=stock.state))
        ctx[sid] = (r, price, d, eta, st_arrive, stock)

    scored = rank(cands, mode, has_location=origin is not None)
    listed, unavailable = [], []
    for i, s in enumerate(scored, start=1):
        r, price, d, eta, st_arrive, stock = ctx[s.candidate.key]
        now = open_status_view(r, at)
        unknown = [k for k, missing in (("price", price.value is None), ("distance", origin is None),
                                        ("open", st_arrive.state == "unknown"),
                                        ("fresh", price.kind == "listed" and (price.freshness or "unknown") == "unknown"))
                   if missing]
        # A seller who said «ناموجود» today leaves the ranked list for the «unavailable» section.
        (unavailable if stock.state == "out_of_stock" else listed).append(SellerRow(
            shop=shop_ref(r), offer_id=r["offer_id"], seller_title=r["seller_title"], price=price, stock=stock,
            distance_m=d, eta_min=eta, travel=travel, open_status=st_arrive, open_now=now,
            arrival_note=arrival_note(now, st_arrive) if origin else None, unknown_factors=unknown,
            payment=payment_view(r), warranty=Warranty(months=r["warranty_months"], text=r["warranty_raw"]),
            score=s.score, components=Components(**s.components), reasons=s.reasons, rank=i))

    related = _related(prod["category"], set(by_shop), origin, at, travel, radius)
    return SellersOut(product_id=product_id, mode=mode if mode in WEIGHTS else "balanced",
                      weights=WEIGHTS.get(mode, WEIGHTS["balanced"]), travel=travel, has_location=origin is not None,
                      listed=[row.model_copy(update={"rank": i}) for i, row in enumerate(listed, start=1)],
                      unavailable=unavailable, related=related, excluded_unknown=excluded_unknown,
                      excluded_other=excluded_other, related_note=RELATED_NOTE)


def arrival_note(now, arrive) -> str | None:
    """«وقتی برسی …» when the trip changes the picture."""
    if arrive.state == "closing_soon" and arrive.minutes_to_close:
        return f"وقتی برسی حدود {fa.minutes(arrive.minutes_to_close)} تا بستن مانده."
    if arrive.state == "closed" and now.state in ("open", "closing_soon"):
        return "وقتی برسی بسته است."
    return None


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
