"""Simulated seller replies (ARCHITECTURE §10). Deterministic: every random draw is seeded by the inquiry id,
so the same inquiry always gets the same outcome. Pure: inputs in, a plan and an answer out.

The facts come from rules and data; the message text comes from templates (an LLM may rephrase the words in
M5, never the facts)."""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field

from app import fa

DELIVER_S = (0.5, 2.0)
SEEN_S = (2.0, 6.0)
ANSWER_S = (8.0, 40.0)
P_ANSWER = {"open": 0.85, "closing_soon": 0.85, "unknown": 0.7, "closed": 0.0}
P_STOCK = {"fresh": 0.8, "aging": 0.65, "stale": 0.5, "unknown": 0.5}
P_STOCK_RELATED = 0.35
DRIFT = {"fresh": (0.0, 0.03), "aging": (0.0, 0.08), "stale": (0.03, 0.15), "unknown": (0.0, 0.08)}
OUTCOMES = ("answer", "out_of_stock", "no_answer", "price_up")


def rng(seed: str) -> random.Random:
    return random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))


@dataclass
class ShopFacts:
    open_state: str  # at the moment of asking
    closes_at: str | None
    hours_today: list[str] | None  # «10:00–21:00»; None = unknown; [] = closed today
    installments: int | None
    installment_types: list[str]
    floor_label: str | None
    unit: str | None
    mall_name: str | None
    address_short: str


@dataclass
class OfferFacts:
    price: int | None  # listed
    freshness: str  # fresh | aging | stale | unknown
    listed: bool  # False = related tier (the shop doesn't list this product)


@dataclass
class Plan:
    deliver_after: float
    seen_after: float | None  # None = never opened
    answer_after: float | None  # None = no answer by the deadline
    outcome: str  # answer | out_of_stock | no_answer
    answer: dict = field(default_factory=dict)


def plan(inquiry_id: str, questions: list[str], detail: str | None, hold_until: str | None,
         shop: ShopFacts, offer: OfferFacts | None, speed: float, deadline_s: float,
         override: str | None = None) -> Plan:
    r = rng(inquiry_id)
    deliver = r.uniform(*DELIVER_S) / speed
    if shop.open_state == "closed" and override not in ("answer", "out_of_stock", "price_up"):
        return Plan(deliver, None, None, "no_answer", {"note": "خارج از ساعت کاری"})
    seen = deliver + r.uniform(*SEEN_S) / speed
    answers = r.random() < P_ANSWER.get(shop.open_state, 0.7)
    if override == "no_answer" or (override is None and not answers):
        return Plan(deliver, seen, None, "no_answer")
    answer_at = min(seen + r.uniform(*ANSWER_S) / speed, deadline_s * 0.9)
    ans = answer(r, questions, detail, hold_until, shop, offer, override)
    return Plan(deliver, seen, answer_at, "out_of_stock" if ans.get("stock") == "out_of_stock" else "answer", ans)


def answer(r: random.Random, questions: list[str], detail: str | None, hold_until: str | None,
           shop: ShopFacts, offer: OfferFacts | None, override: str | None) -> dict:
    fresh = offer.freshness if offer else "unknown"
    p_stock = P_STOCK.get(fresh, 0.5) if (offer and offer.listed) else P_STOCK_RELATED
    in_stock = override in ("answer", "price_up") or (override != "out_of_stock" and r.random() < p_stock)
    out: dict = {"simulated": True}
    if "stock" in questions or "has_model" in questions or offer is not None:
        out["stock"] = "in_stock" if in_stock else "out_of_stock"
        out["stock_detail"] = (detail or "").strip() or None
    if not in_stock:
        out["message"] = _message(out, shop)
        return out
    # The seller sometimes skips one secondary question; it stays «جواب نداد» in the thread.
    secondary = [q for q in questions if q in ("installments", "hold", "hours")]
    skipped = r.choice(secondary) if secondary and r.random() < 0.25 else None
    if "price" in questions and offer and offer.price:
        lo, hi = DRIFT.get(fresh, (0.0, 0.08))
        if override == "price_up":
            lo, hi = 0.06, 0.15
        drift = r.uniform(lo, hi) * (1 if (override == "price_up" or r.random() < 0.8) else -1)
        out["price"] = max(10_000, int(round(offer.price * (1 + drift) / 10_000) * 10_000))
    if "hours" in questions and skipped != "hours":
        out["hours_today"] = _hours(r, shop)
    if "location" in questions:
        out["location"] = _location(r, shop)
    if "installments" in questions and skipped != "installments":
        out["installments"] = _installments(r, shop)
    if "hold" in questions and skipped != "hold" and hold_until:
        out["hold"] = f"تا {fa.digits(hold_until)} نگه می‌داریم"
    out["message"] = _message(out, shop)
    return out


def _hours(r: random.Random, shop: ShopFacts) -> str:
    if shop.closes_at:
        return f"تا {fa.digits(shop.closes_at)} باز است"
    return f"تا {fa.digits(r.choice(['20:00', '21:00', '21:30']))} باز است"


def _location(r: random.Random, shop: ShopFacts) -> str:
    if shop.mall_name and shop.floor_label and shop.unit:
        return fa.digits(f"{shop.floor_label}، واحد {shop.unit}")
    if shop.mall_name:
        floor = shop.floor_label or r.choice(["همکف", "طبقه ۱", "طبقه ۲", "زیرزمین"])
        side = r.choice(["کنار پله‌برقی", "روبه‌روی آسانسور", "انتهای راهرو", "نزدیک ورودی اصلی"])
        return fa.digits(f"{floor}، {side}")
    return fa.digits(f"همکف، {shop.address_short}" if shop.address_short else "همکف، کنار در ورودی")


def _installments(r: random.Random, shop: ShopFacts) -> str:
    if shop.installments == 1:
        return "بله، " + ("، ".join(shop.installment_types) if shop.installment_types else "با چک یا اقساط ماهانه")
    if shop.installments == 0:
        return "نه، اقساط نداریم"
    return r.choice(["بله، با چک", "نه، فقط نقدی", "بله، با اسنپ‌پی"])


def price_spoken(toman: int) -> str:
    """3_700_000 → «۳ میلیون و ۷۰۰», 89_520_000 → «۸۹ میلیون و ۵۲۰»."""
    m, rest = divmod(toman, 1_000_000)
    k = rest // 1000
    if m and k:
        # «۳ میلیون و ۷۰۰» is how sellers say it; below 100 the «هزار» is needed to be unambiguous.
        return f"{fa.digits(m)} میلیون و {fa.digits(k)}" + (" هزار" if k < 100 else "")
    if m:
        return f"{fa.digits(m)} میلیون"
    return f"{fa.digits(k)} هزار"


def _message(a: dict, shop: ShopFacts) -> str:
    what = a.get("stock_detail")
    if a.get("stock") == "out_of_stock":
        return f"سلام، متأسفانه {fa.digits(what) + ' ' if what else ''}این مدل تموم شده."
    parts = [f"سلام، بله {fa.digits(what) + ' ' if what else ''}موجوده." if a.get("stock") == "in_stock" else "سلام."]
    if a.get("price"):
        parts.append(f"قیمت امروز {price_spoken(a['price'])} هست.")
    if a.get("location"):
        parts.append(f"ما {a['location']} هستیم.")
    if a.get("hours_today"):
        parts.append(a["hours_today"].replace("باز است", "هستیم") + ".")
    if a.get("hold"):
        parts.append(a["hold"].replace("نگه می‌داریم", "براتون نگه می‌داریم") + ".")
    return " ".join(parts)
