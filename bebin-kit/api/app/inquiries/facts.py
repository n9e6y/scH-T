"""Catalog facts about a shop (and its offer for a product) at a moment: what the simulator and composer need."""
from __future__ import annotations

import json
from datetime import datetime

from app import freshness
from app.db import catalog
from app.hours import open_status, weekday_index
from app.inquiries.simulator import OfferFacts, ShopFacts
from app.views import snapshot, week_of


def shop_row(shop_id: str):
    return catalog().execute("SELECT * FROM shops WHERE shop_id=?", (shop_id,)).fetchone()


def offer_row(shop_id: str, product_id: str):
    """The shop's cheapest plausible offer for the product (same rule as the sellers list)."""
    rows = catalog().execute("SELECT * FROM offers WHERE shop_id=? AND product_id=?", (shop_id, product_id)).fetchall()
    priced = [r for r in rows if r["price_toman"] and not r["price_outlier"]]
    return min(priced, key=lambda r: r["price_toman"]) if priced else (rows[0] if rows else None)


def load(shop_id: str, product_id: str | None, at: datetime) -> tuple[ShopFacts, OfferFacts | None]:
    s = shop_row(shop_id)
    week = week_of(s) if s and s["hours_json"] else None
    st = open_status(week, at)
    today = None
    if week is not None:
        ranges = week.get(weekday_index(at))
        today = None if ranges is None else [f"{a // 60:02d}:{a % 60:02d}–{b // 60:02d}:{b % 60:02d}" for a, b in ranges]
    shop = ShopFacts(
        open_state=st.state, closes_at=st.closes_at, hours_today=today, installments=s["installments"],
        installment_types=json.loads(s["installment_types"]) if s["installment_types"] else [],
        floor_label=s["floor_label"], unit=s["unit"], mall_name=s["mall_name"], address_short=s["address_short"] or "")
    offer = None
    if product_id:
        o = offer_row(shop_id, product_id)
        if o:
            price = o["price_toman"] if (o["price_toman"] and not o["price_outlier"]) else None
            offer = OfferFacts(price=price, freshness=freshness.tier(o["last_price_changed_at"], snapshot()) if price else "unknown",
                               listed=True)
        else:
            offer = OfferFacts(price=None, freshness="unknown", listed=False)
    return shop, offer
