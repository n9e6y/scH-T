"""Seller-verified facts (ARCHITECTURE §10 «Answer propagation»). Only today's verifications count as verified;
older ones are history («قدیمی شده»)."""
from __future__ import annotations

from datetime import datetime

from app.appdb import app_db
from app.hours import TEHRAN


def day_start(now: datetime) -> str:
    return now.astimezone(TEHRAN).replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")


def for_product(product_id: str, now: datetime) -> dict[str, dict]:
    """shop_id → {field: row} for today's price/stock verifications of this product."""
    out: dict[str, dict] = {}
    for r in app_db().execute("SELECT * FROM verifications WHERE product_id=? AND verified_at>=?",
                              (product_id, day_start(now))):
        out.setdefault(r["shop_id"], {})[r["field"]] = r
    return out


def for_shop(shop_id: str, limit: int = 8) -> list:
    return app_db().execute("SELECT * FROM verifications WHERE shop_id=? ORDER BY verified_at DESC LIMIT ?",
                            (shop_id, limit)).fetchall()


def latest(shop_id: str, product_id: str):
    """The most recent stock/price verification for this shop+product, of any day."""
    return app_db().execute("SELECT * FROM verifications WHERE shop_id=? AND product_id=? AND field IN ('stock','price') "
                            "ORDER BY verified_at DESC LIMIT 1", (shop_id, product_id)).fetchone()
