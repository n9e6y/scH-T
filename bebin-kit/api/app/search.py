"""Product search (ARCHITECTURE §4): parse → FTS5 candidates → seller-level filters → cards with reasons."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache

from app import fa, freshness
from app.db import catalog
from app.geo import haversine_m
from app.hours import open_status
from app.models import Chip, Facet, PriceRange, ProductCard, SearchOut
from app.query import parse_query
from app.text import normalize_fa
from app.views import first_image, snapshot, week_of

PAGE_SIZE = 20
CANDIDATES = 400
NEARBY_KM = 3.0
PAY_KEYS = ("installments", "torob_pay", "kala_barg")
PAY_LABELS = {"installments": "اقساطی", "torob_pay": "ترب‌پی", "kala_barg": "کالابرگ"}
SORTS = ("relevance", "cheapest", "nearest", "most_sellers")


@lru_cache(maxsize=1)
def brand_dict() -> dict[str, str]:
    rows = catalog().execute(
        "SELECT brand, count(*) n FROM products WHERE brand IS NOT NULL GROUP BY brand HAVING n >= 15").fetchall()
    out = {}
    for r in rows:
        key = normalize_fa(r["brand"])
        if len(key) >= 3:
            out[key] = r["brand"]
    return out


@lru_cache(maxsize=1)
def areas() -> list[dict]:
    return [dict(r) for r in catalog().execute("SELECT * FROM areas ORDER BY shop_count DESC")]


@lru_cache(maxsize=1)
def group_labels() -> dict[str, str]:
    return {r["key"]: r["label"] for r in catalog().execute("SELECT key, label FROM category_groups")}


def fts_expr(text: str, mode: str = "and") -> str | None:
    tokens = [t for t in re.split(r"[^\w]+", text) if t]
    if not tokens:
        return None
    quoted = [f'"{t}"' for t in tokens[:-1]] + [f'"{tokens[-1]}"*']
    return (" AND " if mode == "and" else " OR ").join(quoted)


@dataclass
class Params:
    q: str = ""
    cat: str | None = None
    brand: str | None = None
    min: int | None = None
    max: int | None = None
    pay: list[str] = field(default_factory=list)
    fast: bool = False
    open: bool = False
    lat: float | None = None
    lng: float | None = None
    radius: float | None = None
    sort: str = "relevance"
    page: int = 1


@dataclass
class _Seller:
    shop_id: str
    price: int | None
    changed: str | None
    lat: float
    lng: float
    pay: dict
    fast: int | None
    hours: dict | None


@lru_cache(maxsize=1)
def _category_names() -> list[tuple[str, str]]:
    return [(r["name"], normalize_fa(r["name"])) for r in catalog().execute("SELECT name FROM categories")]


def head_match(text_tokens: list[str], category_norm: str) -> bool:
    """Persian categories put the head noun first: «لپ تاپ و نوت بوک» is laptops, «شارژر لپ تاپ» is chargers.
    A category matches when it starts with the query's leading tokens (up to two)."""
    lead = text_tokens[:2] if len(text_tokens) >= 2 and text_tokens[1] in category_norm.split()[:3] else text_tokens[:1]
    return bool(lead) and category_norm.split()[:len(lead)] == lead


@lru_cache(maxsize=1)
def _category_sizes() -> dict[str, int]:
    return {r["name"]: r["product_count"] for r in catalog().execute("SELECT name, product_count FROM categories")}


def _category_hits(text: str) -> list[str]:
    tokens = [t for t in text.split() if len(t) > 1]
    if not tokens:
        return []
    sizes = _category_sizes()
    # Only when the whole query names the category («لپ تاپ», «گوشی»); «گوشی شیائومی» is left to FTS.
    hits = [name for name, norm in _category_names()
            if head_match(tokens, norm) and all(t in norm.split() for t in tokens)]
    return sorted(hits, key=lambda n: -sizes.get(n, 0))[:3]


def _candidates(text: str, cat: str | None) -> list[tuple[int, float]]:
    con = catalog()
    if text:
        found: dict[int, float] = {}
        for mode in ("and", "or"):
            expr = fts_expr(text, mode)
            if not expr:
                break
            rows = con.execute("SELECT rowid, bm25(products_fts) s FROM products_fts WHERE products_fts MATCH ? "
                               "ORDER BY s LIMIT ?", (expr, CANDIDATES)).fetchall()
            if rows:
                found = {r[0]: r[1] for r in rows}
                break
        # bm25 favours short accessory titles; make sure the category the user named is in the pool.
        cats = _category_hits(text)
        if cats:
            scores = sorted(found.values())
            best = scores[len(scores) // 2] if scores else -10.0
            ph = ",".join("?" * len(cats))
            for r in con.execute(f"SELECT rid FROM products WHERE category IN ({ph}) ORDER BY offer_count DESC "
                                 f"LIMIT ?", (*cats, CANDIDATES // 2)):
                found.setdefault(r[0], best)
        return list(found.items())
    if cat:
        rows = con.execute("SELECT rid FROM products WHERE category_group=? OR category=? "
                           "ORDER BY offer_count DESC LIMIT ?", (cat, cat, CANDIDATES)).fetchall()
    else:
        rows = con.execute("SELECT rid FROM products ORDER BY offer_count DESC LIMIT ?", (CANDIDATES,)).fetchall()
    return [(r[0], -float(i)) for i, r in enumerate(rows)]


def _load(rids: list[int]) -> tuple[dict, dict[str, list[_Seller]]]:
    con = catalog()
    ph = ",".join("?" * len(rids))
    prods = {r["product_id"]: dict(r) for r in con.execute(
        f"SELECT rid, product_id, title_fa, brand, model, category, category_group, image_urls, offer_count, "
        f"min_price, max_price, latest_change FROM products WHERE rid IN ({ph})", rids)}
    sellers: dict[str, list[_Seller]] = {pid: [] for pid in prods}
    ids = list(prods)
    if ids:
        ph = ",".join("?" * len(ids))
        for r in con.execute(
                f"SELECT o.product_id, o.price_toman, o.price_outlier, o.last_price_changed_at, s.shop_id, s.lat, "
                f"s.lng, s.installments, s.torob_pay, s.kala_barg, s.fast_delivery, s.hours_json "
                f"FROM offers o JOIN shops s USING(shop_id) WHERE o.product_id IN ({ph})", ids):
            price = r["price_toman"] if (r["price_toman"] and not r["price_outlier"]) else None
            sellers[r["product_id"]].append(_Seller(
                r["shop_id"], price, r["last_price_changed_at"], r["lat"], r["lng"],
                {k: r[k] for k in PAY_KEYS}, r["fast_delivery"],
                week_of(r) if r["hours_json"] else None))
    return prods, sellers


def _seller_passes(s: _Seller, p: Params, at: datetime, origin) -> tuple[bool, str | None]:
    """Returns (passes, unknown_reason). unknown_reason is set when it failed only because of NULL data."""
    if p.min is not None and (s.price is None or s.price < p.min):
        return False, None
    if p.max is not None and (s.price is None or s.price > p.max):
        return False, None
    for k in p.pay:
        if s.pay.get(k) != 1:
            return False, (k if s.pay.get(k) is None else None)
    if p.fast and s.fast != 1:
        return False, ("fast_delivery" if s.fast is None else None)
    if p.open:
        st = open_status(s.hours, at).state
        if st not in ("open", "closing_soon"):
            return False, ("open" if st == "unknown" else None)
    if origin and p.radius:
        if haversine_m(origin[0], origin[1], s.lat, s.lng) > p.radius * 1000:
            return False, None
    return True, None


def _card(prod: dict, passing: list[_Seller], all_sellers: list[_Seller], origin, p: Params, snap) -> ProductCard:
    prices = [s.price for s in passing if s.price]
    tiers = [freshness.tier(s.changed, snap) for s in passing if s.price]
    freshest = max(tiers, key=lambda t: freshness.RANK[t]) if tiers else "unknown"
    dists = sorted(haversine_m(origin[0], origin[1], s.lat, s.lng) for s in passing) if origin else []
    radius_m = (p.radius or NEARBY_KM) * 1000
    nearby = sum(1 for d in dists if d <= radius_m) if origin else None
    shops = {s.shop_id for s in all_sellers}
    reasons = []
    if origin and nearby:
        reasons.append(f"{fa.digits(nearby)} فروشنده در {fa.distance(radius_m).replace(' متر', ' متری').replace(' کیلومتر', ' کیلومتری')}")
    else:
        reasons.append(f"{fa.digits(len(shops))} فروشنده")
    if any(s.pay.get("installments") == 1 for s in passing):
        reasons.append("اقساطی")
    if "torob_pay" in p.pay or (not p.pay and any(s.pay.get("torob_pay") == 1 for s in passing)):
        if any(s.pay.get("torob_pay") == 1 for s in passing):
            reasons.append("ترب‌پی")
    if freshest == "fresh":
        reasons.append("قیمت به‌روز")
    elif freshest == "stale":
        reasons.append("قیمت قدیمی")
    return ProductCard(
        id=prod["product_id"], title=prod["title_fa"], brand=prod["brand"], model=prod["model"],
        category=prod["category"], image=first_image(prod["image_urls"]),
        price_range=PriceRange(min=min(prices) if prices else None, max=max(prices) if prices else None),
        seller_count=len(shops), nearby_seller_count=nearby, nearest_distance_m=dists[0] if dists else None,
        freshest=freshest, reasons=reasons[:3])


def _filter_all(prods, sellers, p: Params, at, origin):
    kept, excluded_unknown = [], {}
    for pid, prod in prods.items():
        if p.cat and p.cat not in (prod["category_group"], prod["category"]):
            continue
        passing, unknown_reasons = [], set()
        for s in sellers[pid]:
            ok, why = _seller_passes(s, p, at, origin)
            if ok:
                passing.append(s)
            elif why:
                unknown_reasons.add(why)
        if passing:
            kept.append((pid, passing))
        elif unknown_reasons:
            for k in unknown_reasons:
                excluded_unknown[k] = excluded_unknown.get(k, 0) + 1
    return kept, excluded_unknown


def search(p: Params, at: datetime) -> SearchOut:
    pq = parse_query(p.q, brand_dict(), [a["name_fa"] for a in areas()])
    f = pq.filters
    p.max = p.max if p.max is not None else f.get("max")
    p.min = p.min if p.min is not None else f.get("min")
    p.pay = sorted(set(p.pay) | set(f.get("pay", [])))
    p.open = p.open or f.get("open", False)
    p.brand = p.brand or f.get("brand")
    origin = (p.lat, p.lng) if p.lat is not None and p.lng is not None else None
    if f.get("area"):
        a = next(a for a in areas() if a["name_fa"] == f["area"])
        origin = (a["lat"], a["lng"])
        p.radius = p.radius or NEARBY_KM
    if f.get("near") and origin:
        p.radius = p.radius or NEARBY_KM
    chips = [Chip(key=c.key, label=c.label, value=c.value) for c in pq.chips]
    if f.get("near") and not origin:
        chips = [c for c in chips if c.key != "near"]

    text = pq.text
    cands = _candidates(text, p.cat)
    if not cands:
        return SearchOut(query=p.q, text=text, understood_chips=chips, items=[], total=0, page=p.page,
                         has_more=False, relax=None)
    rel = {rid: s for rid, s in cands}
    prods, sellers = _load(list(rel))
    kept, excluded_unknown = _filter_all(prods, sellers, p, at, origin)
    snap = snapshot()

    cards = [(prods[pid], _card(prods[pid], passing, sellers[pid], origin, p, snap)) for pid, passing in kept]

    qtokens = [t for t in re.split(r"[^\w]+", text) if len(t) > 1]

    def relevance(item):
        prod, card = item
        bm = rel[prod["rid"]]  # more negative = better
        boost = 0.6 * math.log1p(card.seller_count) + 0.3 * freshness.RANK[card.freshest]
        if qtokens:
            cat_n = normalize_fa(prod["category"])
            title_n = normalize_fa(prod["title_fa"])
            # «گوشی شیائومی» should find phones before phone batteries: reward a category
            # match and a title that starts with the query's head noun.
            boost += 3.0 if head_match(qtokens, cat_n) else 0.5 * sum(1 for t in qtokens if t in cat_n) / len(qtokens)
            boost += 1.5 if title_n.startswith(qtokens[0]) else 0
        return bm - boost

    keyf = {
        "relevance": relevance,
        "cheapest": lambda it: (it[1].price_range.min is None, it[1].price_range.min or 0),
        "nearest": lambda it: (it[1].nearest_distance_m is None, it[1].nearest_distance_m or 0),
        "most_sellers": lambda it: -it[1].seller_count,
    }.get(p.sort if p.sort in SORTS else "relevance")
    cards.sort(key=keyf)

    relax = None
    if not cards:
        relax = _relax(prods, sellers, p, at, origin, chips)

    facets = _facets([c[0] for c in cards])
    mins = sorted(c[1].price_range.min for c in cards if c[1].price_range.min)
    quartiles = [mins[int(len(mins) * q)] for q in (0.25, 0.5, 0.75)] if len(mins) >= 8 else []
    start = (p.page - 1) * PAGE_SIZE
    page_items = [c[1] for c in cards[start:start + PAGE_SIZE]]
    return SearchOut(query=p.q, text=text, understood_chips=chips, items=page_items, total=len(cards),
                     page=p.page, has_more=start + PAGE_SIZE < len(cards), excluded_unknown=excluded_unknown,
                     facets=facets, price_quartiles=quartiles, relax=relax)


def _relax(prods, sellers, p: Params, at, origin, chips) -> Chip | None:
    """The single filter whose removal brings back the most results."""
    options = []
    for k in p.pay:
        options.append((Chip(key="pay", label=f"بدون فیلتر {PAY_LABELS[k]}", value=k),
                        Params(**{**p.__dict__, "pay": [x for x in p.pay if x != k]})))
    if p.max is not None:
        options.append((Chip(key="max", label="بدون سقف قیمت"), Params(**{**p.__dict__, "max": None})))
    if p.min is not None:
        options.append((Chip(key="min", label="بدون حداقل قیمت"), Params(**{**p.__dict__, "min": None})))
    if p.open:
        options.append((Chip(key="open", label="بسته‌ها را هم نشان بده"), Params(**{**p.__dict__, "open": False})))
    if p.radius:
        options.append((Chip(key="radius", label="همه‌ی فاصله‌ها"), Params(**{**p.__dict__, "radius": None})))
    if p.fast:
        options.append((Chip(key="fast", label="بدون ارسال فوری"), Params(**{**p.__dict__, "fast": False})))
    best, best_n = None, 0
    for chip, alt in options:
        n = len(_filter_all(prods, sellers, alt, at, origin)[0])
        if n > best_n:
            best, best_n = chip, n
    return best


def _facets(prods: list[dict]) -> dict[str, list[Facet]]:
    labels = group_labels()
    groups, brands = {}, {}
    for pr in prods:
        groups[pr["category_group"]] = groups.get(pr["category_group"], 0) + 1
        if pr["brand"]:
            brands[pr["brand"]] = brands.get(pr["brand"], 0) + 1
    return {
        "category": [Facet(key=k, label=labels.get(k, k), count=n) for k, n in
                     sorted(groups.items(), key=lambda kv: -kv[1])],
        "brand": [Facet(key=k, label=k, count=n) for k, n in sorted(brands.items(), key=lambda kv: -kv[1])[:12]],
    }
