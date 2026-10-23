"""Product detail, similar products (ARCHITECTURE §9) and compare (PRODUCT_SPEC F6)."""
from __future__ import annotations

import json
import math
import re
from collections import Counter

from app import embeddings, fa, freshness
from app.db import catalog
from app.geo import haversine_m
from app.models import (CompareColumn, CompareOut, CompareRow, PriceRange, ProductCard, ProductDetail, Spec,
                        SimilarItem, Stock)
from app.text import normalize_fa
from app.fa import jalali
from app.views import TRUST_SUMMARY, first_image, shop_ref, snapshot

KEY_SPECS = 8
SIMILAR_POOL = 300
NEARBY_KM = 3.0
_SKIP_SPEC_KEYS = {"نام محصول", "توضیحات", "سایر توضیحات", "سایر مشخصات"}


def clean_specs(raw: str | None) -> dict[str, str]:
    """Spec values arrive with list debris («۲۵۶ گیگابایت, ,»); trim separators, drop empties."""
    out = {}
    for k, v in (json.loads(raw) if raw else {}).items():
        v = re.sub(r"(?:\s*[,،]\s*)+$", "", str(v)).strip()
        if v:
            out[k] = v
    return out


def detail(product_id: str) -> ProductDetail | None:
    con = catalog()
    p = con.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
    if not p:
        return None
    specs = clean_specs(p["specs"])
    spec_list = [Spec(key=k, value=v) for k, v in specs.items()]
    key_specs = [s for s in spec_list if s.key not in _SKIP_SPEC_KEYS][:KEY_SPECS]
    shops = con.execute("SELECT count(DISTINCT shop_id) FROM offers WHERE product_id=?", (product_id,)).fetchone()[0]
    tiers = [freshness.tier(r[0], snapshot()) for r in con.execute(
        "SELECT last_price_changed_at FROM offers WHERE product_id=? AND price_toman IS NOT NULL AND price_outlier=0",
        (product_id,))]
    freshest = max(tiers, key=lambda t: freshness.RANK[t]) if tiers else "unknown"
    return ProductDetail(
        id=p["product_id"], title=p["title_fa"], brand=p["brand"], model=p["model"], category=p["category"],
        category_group=p["category_group"], images=json.loads(p["image_urls"] or "[]"), specs=spec_list,
        key_specs=key_specs, price_range=PriceRange(min=p["min_price"], max=p["max_price"]), seller_count=shops,
        latest_change=p["latest_change"], freshest=freshest, stock=Stock(), trust_summary=TRUST_SUMMARY)


def _tokens(title: str) -> set[str]:
    return {t for t in re.split(r"[^\w]+", normalize_fa(title)) if len(t) > 1}


def _spec_pairs(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {f"{k}={normalize_fa(v)}" for k, v in json.loads(raw).items() if k not in _SKIP_SPEC_KEYS}


def _nearest(product_ids: list[str], lat: float | None, lng: float | None) -> dict[str, tuple[float, int]]:
    """product_id → (nearest seller distance m, sellers within NEARBY_KM)."""
    if lat is None or lng is None or not product_ids:
        return {}
    ph = ",".join("?" * len(product_ids))
    out: dict[str, list[float]] = {}
    for r in catalog().execute(f"SELECT o.product_id, s.lat, s.lng FROM offers o JOIN shops s USING(shop_id) "
                               f"WHERE o.product_id IN ({ph})", product_ids):
        out.setdefault(r["product_id"], []).append(haversine_m(lat, lng, r["lat"], r["lng"]))
    return {k: (min(v), sum(1 for d in v if d <= NEARBY_KM * 1000)) for k, v in out.items()}


def similar(product_id: str, k: int = 10, lat: float | None = None, lng: float | None = None) -> list[SimilarItem] | None:
    con = catalog()
    p = con.execute("SELECT * FROM products WHERE product_id=?", (product_id,)).fetchone()
    if not p:
        return None
    # With vectors the pool is the category's nearest neighbours and cosine replaces title-token overlap.
    cos = None
    if embeddings.available():
        rids = [r[0] for r in con.execute("SELECT rid FROM products WHERE category=? AND product_id<>?",
                                          (p["category"], product_id))]
        cos = embeddings.similarity(p["rid"], rids)
    if cos:
        near_rids = sorted(cos, key=lambda r: -cos[r])[:SIMILAR_POOL]
        pool = con.execute(f"SELECT * FROM products WHERE rid IN ({','.join('?' * len(near_rids))})",
                           near_rids).fetchall()
    else:
        pool = con.execute("SELECT * FROM products WHERE category=? AND product_id<>? ORDER BY offer_count DESC "
                           "LIMIT ?", (p["category"], product_id, SIMILAR_POOL)).fetchall()
    base_tokens, base_specs, base_price = _tokens(p["title_fa"]), _spec_pairs(p["specs"]), p["min_price"]
    base_brand = normalize_fa(p["brand"] or "")
    scored = []
    for q in pool:
        if cos:  # text-embedding-3-small: unrelated titles sit near 0.5, near-duplicates above 0.9
            title_j = min(1.0, max(0.0, (cos[q["rid"]] - 0.5) / 0.4))
        else:
            tok = _tokens(q["title_fa"])
            title_j = len(base_tokens & tok) / max(1, len(base_tokens | tok))
        sp = _spec_pairs(q["specs"])
        spec_j = len(base_specs & sp) / max(1, len(base_specs | sp)) if base_specs and sp else 0
        brand_same = bool(base_brand) and normalize_fa(q["brand"] or "") == base_brand
        price_close, ratio = 0.0, None
        if base_price and q["min_price"]:
            ratio = q["min_price"] / base_price
            price_close = max(0.0, 1 - abs(math.log(ratio)) / math.log(1.3))
        score = 0.35 * title_j + 0.2 * spec_j + 0.15 * brand_same + 0.2 * price_close + 0.1 * min(1, q["offer_count"] / 5)
        reasons = ["همان دسته"]
        if brand_same:
            reasons.append("برند مشابه")
        elif title_j >= 0.4:
            reasons.append("مدل مشابه")
        if ratio is not None and abs(ratio - 1) <= 0.1:
            reasons.append("قیمت نزدیک (±۱۰٪)")
        elif ratio is not None and abs(ratio - 1) <= 0.3:
            reasons.append("قیمت نزدیک")
        scored.append((score, q, reasons[:3]))
    scored.sort(key=lambda x: -x[0])
    top = scored[:k]
    near = _nearest([q["product_id"] for _, q, _ in top], lat, lng)
    snap = snapshot()
    items = []
    for _, q, reasons in top:
        nd, nc = near.get(q["product_id"], (None, None))
        items.append(SimilarItem(
            id=q["product_id"], title=q["title_fa"], brand=q["brand"], model=q["model"], category=q["category"],
            image=first_image(q["image_urls"]), price_range=PriceRange(min=q["min_price"], max=q["max_price"]),
            seller_count=q["offer_count"], nearby_seller_count=nc, nearest_distance_m=nd,
            freshest=freshness.tier(q["latest_change"], snap), reasons=reasons))
    return items


def compare(ids: list[str], lat: float | None, lng: float | None) -> CompareOut:
    con = catalog()
    ph = ",".join("?" * len(ids))
    prods = {r["product_id"]: r for r in con.execute(f"SELECT * FROM products WHERE product_id IN ({ph})", ids)}
    ids = [i for i in ids if i in prods]
    near_rows: dict[str, list] = {i: [] for i in ids}
    pays: dict[str, set] = {i: set() for i in ids}
    warranty: dict[str, int | None] = {i: None for i in ids}
    for r in con.execute(f"SELECT o.product_id, o.warranty_months, s.* FROM offers o JOIN shops s USING(shop_id) "
                         f"WHERE o.product_id IN ({ph})", ids):
        pid = r["product_id"]
        d = haversine_m(lat, lng, r["lat"], r["lng"]) if lat is not None and lng is not None else None
        near_rows[pid].append((d, r))
        for k, label in (("installments", "اقساطی"), ("torob_pay", "ترب‌پی"), ("kala_barg", "کالابرگ")):
            if r[k] == 1:
                pays[pid].add(label)
        if r["warranty_months"]:
            warranty[pid] = max(warranty[pid] or 0, r["warranty_months"])

    cols = []
    for pid in ids:
        p = prods[pid]
        rows = near_rows[pid]
        nearest = min((x for x in rows if x[0] is not None), key=lambda x: x[0], default=None)
        nearby = sum(1 for d, _ in rows if d is not None and d <= NEARBY_KM * 1000) if lat is not None else None
        cols.append(CompareColumn(
            id=pid, title=p["title_fa"], brand=p["brand"], image=first_image(p["image_urls"]),
            price_range=PriceRange(min=p["min_price"], max=p["max_price"]),
            seller_count=len({r["shop_id"] for _, r in rows}), nearby_seller_count=nearby,
            nearest=shop_ref(nearest[1]) if nearest else None, nearest_distance_m=nearest[0] if nearest else None,
            payments=sorted(pays[pid]),
            warranty=f"تا {fa.digits(warranty[pid])} ماه" if warranty[pid] else None, best_for=[]))

    priced = [c for c in cols if c.price_range.min]
    if len(priced) >= 2:
        min(priced, key=lambda c: c.price_range.min).best_for.append("ارزان‌ترین")
    dist = [c for c in cols if c.nearest_distance_m is not None]
    if len(dist) >= 2:
        min(dist, key=lambda c: c.nearest_distance_m).best_for.append("نزدیک‌ترین فروشنده")
    if len(cols) >= 2 and len({c.seller_count for c in cols}) > 1:
        max(cols, key=lambda c: c.seller_count).best_for.append("بیشترین فروشنده")

    specs = {pid: clean_specs(prods[pid]["specs"]) for pid in ids}
    key_counts = Counter(k for s in specs.values() for k in s if k not in _SKIP_SPEC_KEYS)
    keys = [k for k, n in key_counts.most_common() if n >= 2][:12] or [k for k, _ in key_counts.most_common(8)]
    rows = []
    for key in keys:
        vals = [specs[pid].get(key) for pid in ids]
        present = {normalize_fa(v) for v in vals if v}
        rows.append(CompareRow(key=key, values=vals, differs=len(present) > 1 or (len(present) == 1 and None in vals),
                               ltr=all(not v or _LATIN.fullmatch(v) for v in vals)))
    inst = {pid: (sum(1 for _, r in near_rows[pid] if r["installments"] == 1),
                  sum(1 for _, r in near_rows[pid] if r["installments"] is None)) for pid in ids}
    for c in cols:
        c.verdict = _verdict(c, cols, len([v for v in specs[c.id].values() if v]),
                             [len([v for v in specs[i].values() if v]) for i in ids])
    summary = _summary(cols, inst, prods, ids)
    source = _llm_verdicts(cols, summary)
    return CompareOut(columns=cols, summary=summary, specs=rows, verdict_source=source)


VERDICT_SYSTEM = ("برای هر کالا یک جمله‌ی کوتاه فارسی (حداکثر ۱۴ کلمه) بنویس که بگوید برای چه کسی مناسب‌تر است، "
                  "فقط بر اساس داده‌ها. درباره‌ی موجودی هیچ ادعایی نکن؛ قیمت‌ها «ثبت‌شده» هستند. "
                  "خروجی JSON: {\"verdicts\": [\"...\", ...]} به همان ترتیب و تعداد کالاها.")


def _llm_verdicts(cols, summary) -> str:
    """Compare verdict line (PRODUCT_SPEC F6, M5): LLM wording, cached per id set; rules text is the fallback."""
    from app import llm
    facts = [{"title": c.title[:70], "best_for": c.best_for,
              **{r.key: r.values[i] for r in summary}} for i, c in enumerate(cols)]
    try:
        out = llm.cached("compare_verdict", sorted(c.id for c in cols),
                         lambda: llm.chat_json_sync(VERDICT_SYSTEM, json.dumps(facts, ensure_ascii=False), max_tokens=220))
    except llm.LLMUnavailable:
        return "rules"
    v = out.get("verdicts")
    if not isinstance(v, list) or len(v) != len(cols) or not all(isinstance(x, str) and 3 < len(x) < 160 for x in v):
        return "rules"
    if any("موجود" in x for x in v):  # never let the wording imply stock
        return "rules"
    for c, text in zip(cols, v):
        c.verdict = text.strip()
    return "llm"


_LATIN = re.compile(r"[A-Za-z0-9 .\-+/()]+")


def _leader(vals: list, best=min) -> int | None:
    """Index of the single best value; None on ties or when fewer than two values are known."""
    known = [(v, i) for i, v in enumerate(vals) if v is not None]
    if len(known) < 2:
        return None
    top = best(v for v, _ in known)
    hits = [i for v, i in known if v == top]
    return hits[0] if len(hits) == 1 else None


def _summary(cols, inst, prods, ids) -> list[CompareRow]:
    def rng(c):
        lo, hi = c.price_range.min, c.price_range.max
        return None if not lo else fa.number(lo) if not hi or hi == lo else f"{fa.number(lo)} تا {fa.number(hi)}"
    changed = [prods[pid]["latest_change"] for pid in ids]
    out = [
        CompareRow(key="قیمت ثبت‌شده (تومان)", values=[rng(c) for c in cols], differs=True,
                   leader=_leader([c.price_range.min for c in cols])),
        CompareRow(key="تعداد فروشنده", values=[f"{fa.digits(c.seller_count)} فروشنده" for c in cols], differs=True,
                   leader=_leader([c.seller_count for c in cols], max)),
        CompareRow(key="نزدیک‌ترین فروشنده", differs=True,
                   values=[fa.distance(c.nearest_distance_m) if c.nearest_distance_m is not None else None for c in cols],
                   leader=_leader([c.nearest_distance_m for c in cols])),
    ]
    iv = []
    for c in cols:
        yes, unk = inst[c.id]
        iv.append(f"{fa.digits(yes)} از {fa.digits(c.seller_count)} فروشنده" + (f"، {fa.digits(unk)} نامشخص" if unk else ""))
    out.append(CompareRow(key="اقساطی", values=iv, differs=True,
                          leader=_leader([inst[c.id][0] / c.seller_count if c.seller_count else None for c in cols], max)))
    out.append(CompareRow(key="آخرین تغییر قیمت", differs=True,
                          values=[jalali(v) if v else None for v in changed],
                          leader=_leader([v[:10] if v else None for v in changed], max)))
    return out


def _verdict(c, cols, n_specs: int, all_specs: list[int]) -> str | None:
    """Deterministic one-liner from the column's facts (the LLM verdict replaces it in M5)."""
    parts = []
    if "نزدیک‌ترین فروشنده" in c.best_for:
        parts.append("نزدیک‌ترین فروشنده به تو")
    if "بیشترین فروشنده" in c.best_for:
        parts.append("بیشترین انتخاب فروشنده")
    if "ارزان‌ترین" in c.best_for:
        parts.append("ارزان‌ترین شروع قیمت")
    priced = [x for x in cols if x.price_range.min]
    if len(priced) >= 2 and c.price_range.min and c.price_range.min == max(x.price_range.min for x in priced):
        parts.append(f"گران‌ترینِ این {fa.digits(len(cols))}")
    if len(all_specs) >= 2 and n_specs == min(all_specs) and n_specs < max(all_specs):
        parts.append("مشخصات فنی کمتری ثبت شده")
    return ("؛ ".join(parts) + ".") if parts else None


def to_card(p) -> ProductCard:
    return ProductCard(id=p["product_id"], title=p["title_fa"], brand=p["brand"], model=p["model"],
                       category=p["category"], image=first_image(p["image_urls"]),
                       price_range=PriceRange(min=p["min_price"], max=p["max_price"]), seller_count=p["offer_count"],
                       freshest=freshness.tier(p["latest_change"], snapshot()), reasons=[])
