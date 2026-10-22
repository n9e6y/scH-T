"""Shop ranking for a product (ARCHITECTURE §8). Pure: rows in, scored rows out."""
from __future__ import annotations

from dataclasses import dataclass, field
from math import exp

from app import fa

WEIGHTS = {
    "balanced": {"price": .35, "distance": .30, "open": .15, "fresh": .10, "verified": .10},
    "cheapest": {"price": .60, "distance": .15, "open": .10, "fresh": .10, "verified": .05},
    "nearest": {"price": .15, "distance": .60, "open": .15, "fresh": .05, "verified": .05},
}
FRESH_SCORE = {"fresh": 1.0, "aging": .6, "stale": .3, "unknown": .3}
OPEN_SCORE = {"open": 1.0, "closing_soon": .5, "unknown": .4, "closed": 0.0}
MAX_REASONS = 3
MAX_REASON_LEN = 40


@dataclass
class Candidate:
    key: str
    price: int | None
    price_kind: str  # listed | verified | none
    freshness: str
    route_km: float | None
    open_state: str  # at arrival
    closes_at: str | None = None
    stock: str = "unknown"
    installments: int | None = None
    torob_pay: int | None = None
    warranty_months: int | None = None
    distance_m: float | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class Scored:
    candidate: Candidate
    score: float
    components: dict[str, float]
    reasons: list[str]


def components(c: Candidate, min_price: int | None, has_location: bool) -> dict[str, float]:
    price = (min_price / c.price) if (c.price and min_price) else 0.3
    distance = exp(-c.route_km / 3) if (has_location and c.route_km is not None) else 0.5
    fresh = 1.0 if c.price_kind == "verified" else FRESH_SCORE.get(c.freshness, .3)
    # Closing within 30 min of arrival counts as half-open.
    open_ = OPEN_SCORE.get(c.open_state, .4)
    verified = 1.0 if c.stock == "in_stock" else 0.5
    return {"price": round(min(price, 1.0), 4), "distance": round(distance, 4), "open": open_,
            "fresh": fresh, "verified": verified}


def build_reasons(c: Candidate, comp: dict[str, float], weights: dict[str, float], min_price: int | None,
                  has_location: bool) -> list[str]:
    """Deterministic Persian reasons: top contributing components first, then facts, then cautions."""
    contrib = sorted(((weights[k] * v, k) for k, v in comp.items()), reverse=True)
    out: list[str] = []
    for _, k in contrib:
        if k == "price" and c.price and min_price:
            if c.price == min_price:
                out.append("ارزان‌ترین قیمت تأییدشده" if c.price_kind == "verified" else "ارزان‌ترین قیمت ثبت‌شده")
            elif c.price <= min_price * 1.05:
                out.append("قیمت نزدیک به کمترین")
        elif k == "distance" and has_location and c.distance_m is not None and comp["distance"] >= .5:
            out.append(f"{fa.distance(c.distance_m)} تا اینجا")
        elif k == "open" and c.open_state == "open" and c.closes_at:
            out.append(f"تا {fa.digits(c.closes_at)} باز است")
        if len(out) >= 2:
            break
    if c.installments == 1:
        out.append("اقساطی")
    if c.warranty_months:
        out.append(f"گارانتی {fa.digits(c.warranty_months)} ماهه")
    if c.price_kind == "listed" and c.freshness == "stale":
        out.append("قیمت قدیمی")
    seen, final = set(), []
    for r in out:
        if r not in seen and len(r) <= MAX_REASON_LEN:
            seen.add(r)
            final.append(r)
    # Keep a caution if there is one, even when the list is full.
    if "قیمت قدیمی" in final and final.index("قیمت قدیمی") >= MAX_REASONS:
        final = final[:MAX_REASONS - 1] + ["قیمت قدیمی"]
    return final[:MAX_REASONS]


def rank(cands: list[Candidate], mode: str = "balanced", has_location: bool = True) -> list[Scored]:
    weights = WEIGHTS.get(mode, WEIGHTS["balanced"])
    prices = [c.price for c in cands if c.price]
    min_price = min(prices) if prices else None
    scored = []
    for c in cands:
        comp = components(c, min_price, has_location)
        if not has_location:
            comp_w = {k: (0 if k == "distance" else w) for k, w in weights.items()}
            total_w = sum(comp_w.values())
            score = sum(comp_w[k] * comp[k] for k in comp) / total_w
        else:
            score = sum(weights[k] * comp[k] for k in comp)
        scored.append(Scored(c, round(score, 4), comp, build_reasons(c, comp, weights, min_price, has_location)))
    scored.sort(key=lambda s: (-s.score, s.candidate.price or 1 << 62, s.candidate.key))
    return scored
