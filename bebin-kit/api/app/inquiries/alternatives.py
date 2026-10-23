"""Alternatives cascade (PRODUCT_SPEC F11, ARCHITECTURE §9). Nearest fix first:
1. the same product at other listed sellers, 2. similar products at the same shop, 3. similar products nearby,
4. related stores (category match only, labelled as such). Failed shops are excluded; active filters apply."""
from __future__ import annotations

from datetime import datetime

from app import fa, products
from app.db import catalog
from app.models import AltItem, AlternativesOut, AltTier
from app.sellers import sellers as sellers_of

PAY_LABEL = {"installments": "اقساطی", "torob_pay": "ترب‌پی", "kala_barg": "کالابرگ"}


def _short(title: str, model: str | None) -> tuple[str, str | None]:
    return (title, None) if not model else (title, model)


def alternatives(product_id: str, failed: list[str], at: datetime, lat: float | None, lng: float | None,
                 pay: list[str] | None = None) -> AlternativesOut:
    pay = pay or []
    failed_set = set(failed)
    tiers: list[AltTier] = []
    out = sellers_of(product_id, at, lat, lng, "balanced", "walk", pay)
    if out is None:
        return AlternativesOut(tiers=[], note="این کالا پیدا نشد.")
    filt = f"، {'، '.join(PAY_LABEL[p] for p in pay if p in PAY_LABEL)}" if pay else ""

    same = [r for r in out.listed if r.shop.id not in failed_set and r.open_now.state != "closed"][:2]
    items = []
    for i, r in enumerate(same):
        bits = ["همین مدل"]
        if r.distance_m is not None:
            bits.append(fa.distance(r.distance_m))
        if r.open_now.state in ("open", "closing_soon") and r.open_now.closes_at:
            bits.append(f"تا {fa.digits(r.open_now.closes_at)} باز است")
        elif r.open_now.state == "unknown":
            bits.append("ساعت کاری نامشخص")
        if r.stock.state == "in_stock" and r.stock.verified_at:
            bits.append(f"موجودی را ساعت {fa.digits(r.stock.verified_at[11:16])} تأیید کرد")
        elif r.price.freshness == "fresh":
            bits.append("قیمت به‌روز")
        verified = r.stock.state == "in_stock"
        items.append(AltItem(kind="shop", shop_id=r.shop.id, shop_name=r.shop.name, product_id=product_id,
                             title=r.shop.name, reason="، ".join(bits) + filt + ".", action="route" if verified else "ask",
                             action_label="مسیر" if verified else "بپرس", primary=i == 0, lat=r.shop.lat, lng=r.shop.lng))
    if items:
        tiers.append(AltTier(key="same_product", title="همین مدل، فروشنده‌ی دیگر", items=items))

    sim = products.similar(product_id, 30, lat, lng) or []
    con = catalog()
    for sid in failed[:1]:
        here = [s for s in sim if con.execute("SELECT 1 FROM offers WHERE shop_id=? AND product_id=? LIMIT 1",
                                              (sid, s.id)).fetchone()][:1]
        shop = con.execute("SELECT name FROM shops WHERE shop_id=?", (sid,)).fetchone()
        if here and shop:
            s = here[0]
            price = f"{fa.number(s.price_range.min)} تومان؛ " if s.price_range.min else ""
            tiers.append(AltTier(key="same_shop", title="مدل مشابه در همین فروشگاه", items=[AltItem(
                kind="product", product_id=s.id, shop_id=sid, shop_name=shop["name"], title=s.title, model=s.model,
                reason=f"در فهرست {shop['name']}، {price}{'، '.join(s.reasons)}.", action="view", action_label="ببین")]))

    nearby = sorted((s for s in sim if s.nearest_distance_m is not None or lat is None), key=lambda s: s.nearest_distance_m or 0)[:1]
    if nearby:
        s = nearby[0]
        bits = [f"{fa.number(s.price_range.min)} تومان"] if s.price_range.min else []
        if s.nearest_distance_m is not None:
            bits.append(fa.distance(s.nearest_distance_m))
        bits += s.reasons[:1]
        tiers.append(AltTier(key="similar_nearby", title="مدل مشابه در نزدیکی", items=[AltItem(
            kind="product", product_id=s.id, title=s.title, model=s.model, reason="، ".join(bits) + ".",
            action="view", action_label="ببین")]))

    rel = [r for r in out.related if r.shop.id not in failed_set][:1]
    if rel:
        r = rel[0]
        d = f"{fa.distance(r.distance_m)}؛ " if r.distance_m is not None else ""
        tiers.append(AltTier(key="related", title="فروشگاه‌های مرتبط", items=[AltItem(
            kind="shop", shop_id=r.shop.id, shop_name=r.shop.name, product_id=product_id, title=r.shop.name,
            reason=f"{d}این مدل در فهرستش نیست، شاید داشته باشد.", action="ask", action_label="بپرس",
            lat=r.shop.lat, lng=r.shop.lng)]))

    note = None if tiers else "جایگزین نزدیکی پیدا نشد؛ فیلترها را کمتر کن یا شعاع را بزرگ‌تر کن."
    if tiers and pay:
        note = f"فقط فروشنده‌هایی که {'، '.join(PAY_LABEL[p] for p in pay if p in PAY_LABEL)} را ثبت کرده‌اند."
    return AlternativesOut(tiers=tiers, note=note)
