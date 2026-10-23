"""Product search (ARCHITECTURE §4): parse → FTS5 candidates → seller-level filters → cards with reasons."""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache

from app import embeddings, fa, freshness
from app.db import catalog
from app.geo import haversine_m
from app.hours import open_status
from app.models import (Applied, Chip, Facet, NeedOption, NeedQuestion, PriceRange, ProductCard, RelaxOption,
                        SearchOut)
from app.query import parse_query
from app.text import normalize_fa
from app.views import first_image, snapshot, week_of

PAGE_SIZE = 20
CANDIDATES = 400
NEARBY_KM = 3.0
NEEDFINDER_MIN = 40  # PRODUCT_SPEC F4: ask only when the result set is broad
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
    brand: list[str] = field(default_factory=list)
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
    ign: list[str] = field(default_factory=list)  # understood-chip ids the user removed
    unknown: bool = False  # include sellers whose status is unknown for an active filter
    boost: list[str] = field(default_factory=list)  # need-finder «use» answer: rank matching titles first


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
        # Hybrid (EMBEDDINGS_PROVIDER=api): vectors catch synonyms and spellings FTS misses; None → FTS only.
        vec = embeddings.search(text, CANDIDATES)
        if vec:
            found = embeddings.fuse(found, vec)
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


UNKNOWN_THING = {"installments": "اقساط", "torob_pay": "ترب‌پی", "kala_barg": "کالابرگ",
                 "fast_delivery": "ارسال فوری", "open": "ساعت کاری"}


def _check(s: _Seller, p: Params, at: datetime, origin) -> tuple[bool, list[str]]:
    """(hard_ok, unknown_keys). Hard failures are known facts (price, distance, a recorded «no»);
    unknown_keys are active filters this seller has no data for. Every check runs, so a seller that is
    both too far and unknown for installments counts as too far, not as unknown."""
    if p.min is not None and (s.price is None or s.price < p.min):
        return False, []
    if p.max is not None and (s.price is None or s.price > p.max):
        return False, []
    if origin and p.radius and haversine_m(origin[0], origin[1], s.lat, s.lng) > p.radius * 1000:
        return False, []
    unknown = []
    for k in p.pay:
        v = s.pay.get(k)
        if v is None:
            unknown.append(k)
        elif v != 1:
            return False, []
    if p.fast:
        if s.fast is None:
            unknown.append("fast_delivery")
        elif s.fast != 1:
            return False, []
    if p.open:
        st = open_status(s.hours, at).state
        if st == "unknown":
            unknown.append("open")
        elif st not in ("open", "closing_soon"):
            return False, []
    return True, unknown


def _card(prod: dict, passing: list[_Seller], all_sellers: list[_Seller], origin, p: Params, snap) -> ProductCard:
    priced = [s for s in passing if s.price]
    prices = [s.price for s in priced]
    freshest, changed = "unknown", None
    for s in priced:
        t = freshness.tier(s.changed, snap)
        if freshness.RANK[t] > freshness.RANK[freshest] or (t == freshest and (s.changed or "") > (changed or "")):
            freshest, changed = t, s.changed
    dists = sorted(haversine_m(origin[0], origin[1], s.lat, s.lng) for s in passing) if origin else []
    radius_m = (p.radius or NEARBY_KM) * 1000
    nearby = sum(1 for d in dists if d <= radius_m) if origin else None
    shops = {s.shop_id for s in all_sellers}
    reasons = []
    if origin and nearby:
        reasons.append(f"{fa.digits(nearby)} فروشنده در {fa.distance(radius_m).replace(' متر', ' متری').replace(' کیلومتر', ' کیلومتری')}")
    else:
        reasons.append(f"{fa.digits(len(shops))} فروشنده")
    # A pay method the user filtered on: «اقساطی» only if a passing seller recorded it, else «اقساطی؟».
    for k in PAY_KEYS:
        confirmed = any(s.pay.get(k) == 1 for s in passing)
        if k in p.pay:
            reasons.append(PAY_LABELS[k] if confirmed else f"{PAY_LABELS[k]}؟")
        elif k == "installments" and confirmed:
            reasons.append(PAY_LABELS[k])
    if freshest == "fresh":
        reasons.append("قیمت به‌روز")
    elif freshest == "stale":
        reasons.append("قیمت قدیمی")
    return ProductCard(
        id=prod["product_id"], title=prod["title_fa"], brand=prod["brand"], model=prod["model"],
        category=prod["category"], image=first_image(prod["image_urls"]),
        price_range=PriceRange(min=min(prices) if prices else None, max=max(prices) if prices else None),
        seller_count=len(shops), nearby_seller_count=nearby, nearest_distance_m=dists[0] if dists else None,
        freshest=freshest, price_changed_at=changed if freshest != "unknown" else None, reasons=reasons[:3])


def brand_of(prod: dict) -> str | None:
    """products.brand is empty for ~75% of products; fall back to a known brand named in the title."""
    if prod.get("brand"):
        return prod["brand"]
    tokens = normalize_fa(prod["title_fa"]).split()
    known = brand_dict()
    for n in (2, 1):
        for i in range(len(tokens) - n + 1):
            hit = known.get(" ".join(tokens[i:i + n]))
            if hit:
                return hit
    return None


@dataclass
class _Run:
    kept: list  # (pid, passing sellers), after every filter
    unbranded: list  # same, before the brand filter (feeds the brand facet)
    excluded_unknown: dict[str, int]  # products dropped only because of unknowns
    unknown_sellers: dict[str, set]  # key → shops that pass everything known but are unknown for it


def _run(prods, sellers, p: Params, at, origin) -> _Run:
    unbranded, excluded_unknown, unknown_sellers = [], {}, {}
    for pid, prod in prods.items():
        if p.cat and p.cat not in (prod["category_group"], prod["category"]):
            continue
        passing, why = [], set()
        for s in sellers[pid]:
            ok, unknown = _check(s, p, at, origin)
            if not ok:
                continue
            for k in unknown:
                unknown_sellers.setdefault(k, set()).add(s.shop_id)
            if not unknown or p.unknown:
                passing.append(s)
            else:
                why.update(unknown)
        if passing:
            unbranded.append((pid, passing))
        for k in (why if not passing else ()):
            excluded_unknown[k] = excluded_unknown.get(k, 0) + 1
    kept = unbranded
    if p.brand:
        want = set(p.brand)
        kept = [(pid, ps) for pid, ps in unbranded if brand_of(prods[pid]) in want]
    return _Run(kept, unbranded, excluded_unknown, unknown_sellers)


def _apply_understood(p: Params, raw_chips, f: dict, origin):
    """Merge what the query text says into `p`, minus the chips the user removed (`p.ign`).
    Explicit URL params win over parsed values. Returns (chips, area, origin)."""
    ign = set(p.ign)
    chips = []
    for c in raw_chips:
        cid = f"pay:{c.value}" if c.key == "pay" else c.key
        if cid not in ign:
            chips.append(Chip(key=c.key, label=c.label, value=c.value, id=cid))
    active = {c.id for c in chips}
    if p.max is None and "max" in active:
        p.max = f["max"]
    if p.min is None and "min" in active:
        p.min = f["min"]
    p.pay = sorted(set(p.pay) | {k for k in f.get("pay", []) if f"pay:{k}" in active})
    p.open = p.open or "open" in active
    if not p.brand and "brand" in active:
        p.brand = [f["brand"]]
    area = f.get("area") if "area" in active else None
    if area:
        a = next(a for a in areas() if a["name_fa"] == area)
        origin = (a["lat"], a["lng"])
    if p.radius == 0:  # explicit «همه»
        p.radius = None
    elif p.radius is None and (area or ("near" in active and origin)):
        p.radius = NEARBY_KM
    if not origin:
        p.radius = None
        chips = [c for c in chips if c.key != "near"]
    return chips, area, origin


def _nice_ceil(v: float) -> int:
    if v <= 0:
        return 0
    step = 10 ** math.floor(math.log10(v)) / 2
    return int(math.ceil(v / step) * step)


def _round2(v: int) -> int:
    """Two significant digits, for budget bands: 3_740_000 → 3_700_000."""
    if v <= 0:
        return v
    mag = 10 ** max(0, math.floor(math.log10(v)) - 1)
    return int(round(v / mag) * mag)


def _needfinder(total: int, p: Params, quartiles: list[int], brand_facet: list[Facet]) -> list[NeedQuestion]:
    """Data-derived questions for a broad result set (PRODUCT_SPEC F4 fallback; LLM questions come in M5)."""
    if total <= NEEDFINDER_MIN:
        return []
    out = []
    if p.min is None and p.max is None and len(quartiles) == 3:
        q1, q3 = _round2(quartiles[0]), _round2(quartiles[2])
        if 0 < q1 < q3:
            out.append(NeedQuestion(key="budget", label="بودجه", question="بودجه‌ات حدوداً چقدر است؟", options=[
                NeedOption(label=f"تا {fa.price_short(q1)}", max=q1),
                NeedOption(label=f"{fa.price_short(q1)} تا {fa.price_short(q3)}", min=q1, max=q3),
                NeedOption(label=f"بیشتر از {fa.price_short(q3)}", min=q3),
            ]))
    top = [b for b in brand_facet if b.count >= 3][:4]
    if not p.brand and len(top) >= 3:
        out.append(NeedQuestion(key="brand", label="برند", question="برند خاصی مد نظرت هست؟",
                                options=[NeedOption(label=b.label, brand=b.key) for b in top]))
    return out


def search(p: Params, at: datetime) -> SearchOut:
    pq = parse_query(p.q, brand_dict(), [a["name_fa"] for a in areas()])
    origin = (p.lat, p.lng) if p.lat is not None and p.lng is not None else None
    chips, area, origin = _apply_understood(p, pq.chips, pq.filters, origin)
    applied = Applied(cat=p.cat, min=p.min, max=p.max, pay=list(p.pay), fast=p.fast, open=p.open,
                      radius=p.radius, brand=list(p.brand), area=area, unknown=p.unknown,
                      sort=p.sort if p.sort in SORTS else "relevance", boost=list(p.boost))

    text = pq.text
    cands = _candidates(text, p.cat)
    if not cands:
        return SearchOut(query=p.q, text=text, understood_chips=chips, items=[], total=0, page=p.page,
                         has_more=False, applied=applied, relax=None)
    rel = {rid: s for rid, s in cands}
    prods, sellers = _load(list(rel))
    run = _run(prods, sellers, p, at, origin)
    snap = snapshot()

    cards = [(prods[pid], _card(prods[pid], passing, sellers[pid], origin, p, snap)) for pid, passing in run.kept]

    qtokens = [t for t in re.split(r"[^\w]+", text) if len(t) > 1]
    boosts = [normalize_fa(b) for b in p.boost if b.strip()]

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
        if boosts and any(b in normalize_fa(prod["title_fa"]) for b in boosts):
            boost += 4.0
        return bm - boost

    keyf = {
        "relevance": relevance,
        "cheapest": lambda it: (it[1].price_range.min is None, it[1].price_range.min or 0),
        "nearest": lambda it: (it[1].nearest_distance_m is None, it[1].nearest_distance_m or 0),
        "most_sellers": lambda it: -it[1].seller_count,
    }.get(applied.sort)
    cards.sort(key=keyf)

    relax, options, note = None, [], None
    if not cards:
        options = _relax_options(prods, sellers, p, at, origin)
        note = _relax_note(options, run.excluded_unknown)
        best = next((o for o in options if o.count), None)
        relax = Chip(key=best.key, label=best.action, value=best.value) if best else None

    facets = _facets([c[0] for c in cards], [prods[pid] for pid, _ in run.unbranded])
    # Budget bands from the dominant category of the top results, so «گوشی» isn't priced by its accessories.
    top_cats = [c[0]["category"] for c in cards[:40]]
    main_cat = max(set(top_cats), key=top_cats.count) if top_cats else None
    mins = sorted(c[1].price_range.min for c in cards if c[1].price_range.min and c[0]["category"] == main_cat)
    quartiles = [mins[int(len(mins) * q)] for q in (0.25, 0.5, 0.75)] if len(mins) >= 8 else []
    start = (p.page - 1) * PAGE_SIZE
    page_items = [c[1] for c in cards[start:start + PAGE_SIZE]]
    return SearchOut(query=p.q, text=text, understood_chips=chips, items=page_items, total=len(cards),
                     page=p.page, has_more=start + PAGE_SIZE < len(cards), applied=applied,
                     excluded_unknown=run.excluded_unknown,
                     unknown_sellers={k: len(v) for k, v in run.unknown_sellers.items()},
                     facets=facets, price_quartiles=quartiles, price_bounds=_price_bounds(prods.values(), p.cat),
                     relax=relax, relax_options=options, relax_note=note,
                     needfinder=_use_question(len(cards), p, [c[0] for c in cards]) + _needfinder(len(cards), p, quartiles, facets["brand"]))


USE_SYSTEM = ("برای خریدار یک فروشگاه در تهران، یک سؤال کوتاه فارسی درباره‌ی «کاربرد» این دسته‌ی کالا بساز با ۳ گزینه. "
              "برای هر گزینه ۱ تا ۳ کلمه‌ی کلیدی فارسی بده که در عنوان کالاهای مناسب آن کاربرد دیده می‌شود (از روی عنوان‌های نمونه). "
              'خروجی JSON: {"question": "...", "options": [{"label": "...", "keywords": ["..."]}]}')


def _use_question(total: int, p: Params, prods: list[dict]) -> list[NeedQuestion]:
    """LLM «برای چه کاری؟» question (PRODUCT_SPEC F4), cached per category and computed in the background.
    Only options whose keywords match at least two current titles are offered, so every answer changes ranking."""
    from app import llm
    if total <= NEEDFINDER_MIN or p.boost or not prods:
        return []
    cats = [pr["category"] for pr in prods[:40]]
    cat = max(set(cats), key=cats.count)
    sample = [pr["title_fa"][:70] for pr in prods if pr["category"] == cat][:30]
    out = llm.cached_or_background("needfinder_use", cat, lambda: llm.chat_json_sync(
        USE_SYSTEM, json.dumps({"category": cat, "titles": sample}, ensure_ascii=False), max_tokens=260))
    if not out or not isinstance(out.get("options"), list):
        return []
    titles = [normalize_fa(pr["title_fa"]) for pr in prods]
    opts = []
    for o in out["options"][:4]:
        kws = [normalize_fa(k) for k in (o.get("keywords") or []) if isinstance(k, str) and k.strip()]
        if kws and sum(any(k in t for k in kws) for t in titles) >= 2 and isinstance(o.get("label"), str):
            opts.append(NeedOption(label=o["label"][:24], boost=kws))
    if len(opts) < 2 or not isinstance(out.get("question"), str):
        return []
    return [NeedQuestion(key="use", label="کاربرد", question=out["question"][:60], options=opts)]


def _price_bounds(prods, cat) -> PriceRange:
    """Slider range: 0 to a round number above the 95th percentile of the candidates' lowest prices."""
    mins = sorted(pr["min_price"] for pr in prods
                  if pr["min_price"] and (not cat or cat in (pr["category_group"], pr["category"])))
    if not mins:
        return PriceRange(min=None, max=None)
    return PriceRange(min=0, max=_nice_ceil(mins[min(len(mins) - 1, int(len(mins) * 0.95))]))


def _relax_options(prods, sellers, p: Params, at, origin) -> list[RelaxOption]:
    """For each active filter: how many products come back if only that one is dropped. Most first."""
    alts = []
    for k in p.pay:
        alts.append((RelaxOption(key="pay", value=k, label=f"بدون {PAY_LABELS[k]}",
                                 action=f"بدون فیلتر {PAY_LABELS[k]} ببین", count=0),
                     {"pay": [x for x in p.pay if x != k]}))
    if p.max is not None:
        alts.append((RelaxOption(key="max", label="بدون سقف قیمت", action="بدون سقف قیمت ببین", count=0),
                     {"max": None}))
    if p.min is not None:
        alts.append((RelaxOption(key="min", label="بدون حداقل قیمت", action="بدون حداقل قیمت ببین", count=0),
                     {"min": None}))
    if p.open:
        alts.append((RelaxOption(key="open", label="بسته‌ها هم", action="بسته‌ها را هم نشان بده", count=0),
                     {"open": False}))
    if p.radius and origin:
        alts.append((RelaxOption(key="radius", label="همه‌ی فاصله‌ها", action="همه‌ی فاصله‌ها را ببین", count=0),
                     {"radius": None}))
    if p.fast:
        alts.append((RelaxOption(key="fast", label="بدون ارسال فوری", action="بدون ارسال فوری ببین", count=0),
                     {"fast": False}))
    if p.brand:
        alts.append((RelaxOption(key="brand", label="همه‌ی برندها", action="همه‌ی برندها را ببین", count=0),
                     {"brand": []}))
    if not p.unknown and (p.pay or p.fast or p.open):
        alts.append((RelaxOption(key="unknown", label="با وضعیت نامشخص", action="نامشخص‌ها را هم نشان بده",
                                 count=0), {"unknown": True}))
    out = []
    for opt, change in alts:
        opt.count = len(_run(prods, sellers, Params(**{**p.__dict__, **change}), at, origin).kept)
        out.append(opt)
    return sorted(out, key=lambda o: -o.count)


_FILTER_NAME = {"max": "سقف قیمت", "min": "حداقل قیمت", "open": "الان باز", "radius": "فاصله",
                "fast": "ارسال فوری", "brand": "برند"}


def _relax_note(options: list[RelaxOption], excluded_unknown: dict[str, int]) -> str | None:
    best = next((o for o in options if o.count and o.key != "unknown"), None)
    if not options:
        return None
    if not best:
        if any(o.key == "unknown" and o.count for o in options):
            return "فروشنده‌هایی هستند که وضعیتشان برای این فیلترها ثبت نشده. می‌توانی آن‌ها را هم ببینی."
        return "با برداشتن فقط یک فیلتر هم چیزی پیدا نمی‌شود؛ چند فیلتر را با هم بردار یا جست‌وجو را عوض کن."
    name = PAY_LABELS[best.value] if best.key == "pay" else _FILTER_NAME[best.key]
    unk_key = best.value if best.key == "pay" else {"open": "open", "fast": "fast_delivery"}.get(best.key)
    n = excluded_unknown.get(unk_key or "", 0)
    if n:
        return (f"{fa.digits(n)} کالا با بقیه‌ی فیلترها پیدا شد، اما فروشنده‌هایشان {UNKNOWN_THING[unk_key]} را ثبت "
                f"نکرده‌اند. «{name}» سخت‌گیرترین فیلتر توست.")
    return f"با برداشتن «{name}»، {fa.digits(best.count)} کالا پیدا می‌شود. «{name}» سخت‌گیرترین فیلتر توست."


def _facets(prods: list[dict], unbranded: list[dict]) -> dict[str, list[Facet]]:
    labels = group_labels()
    groups, brands = {}, {}
    for pr in prods:
        groups[pr["category_group"]] = groups.get(pr["category_group"], 0) + 1
    # Brands are counted before the brand filter so the sheet can offer the others too.
    for pr in unbranded:
        b = brand_of(pr)
        if b:
            brands[b] = brands.get(b, 0) + 1
    return {
        "category": [Facet(key=k, label=labels.get(k, k), count=n) for k, n in
                     sorted(groups.items(), key=lambda kv: -kv[1])],
        "brand": [Facet(key=k, label=k, count=n) for k, n in sorted(brands.items(), key=lambda kv: -kv[1])[:12]],
    }
