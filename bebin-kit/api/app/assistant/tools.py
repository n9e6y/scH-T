"""Assistant tools (ARCHITECTURE §11.3): thin wrappers over the same services as REST. Each returns
(compact result for the model, UI blocks for the user, a «done» line). Facts only come from here; the model
writes words around them."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import urlencode

from app import fa, places, products, search
from app.inquiries.views import LABELS, product_ref
from app.models import (CompareBlock, InquiryConfirmBlock, InquiryProduct, PlanConfirmBlock, ProductListBlock,
                        QuestionBlock, SellerListBlock, ShopCardBlock, ShopMini)
from app.sellers import sellers as sellers_of

MODE_LABEL = {"balanced": "متعادل", "cheapest": "ارزان‌ترین", "nearest": "نزدیک‌ترین"}

SCHEMAS = [
    {"type": "function", "function": {
        "name": "search_products",
        "description": "Search the catalog of listed products in Tehran stores. Results are ranked by relevance. "
                       "Prices are Toman.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "The product in the user's own Persian words, e.g. «اسپیکر جی بی ال». "
                                                       "Keep brand spellings as the user wrote them (don't switch to Latin), "
                                                       "and leave out places and filters (use the other fields)."},
            "max_price": {"type": "integer"}, "min_price": {"type": "integer"},
            "installments": {"type": "boolean"}, "open_now": {"type": "boolean"}},
            "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "find_sellers",
        "description": "Ranked listed sellers of one product near the user, with price, freshness, open status, distance.",
        "parameters": {"type": "object", "properties": {
            "product_id": {"type": "string"}, "mode": {"type": "string", "enum": ["balanced", "cheapest", "nearest"]},
            "installments": {"type": "boolean"}, "open_now": {"type": "boolean"}}, "required": ["product_id"]}}},
    {"type": "function", "function": {
        "name": "compare_products",
        "description": "Compare 2–3 products side by side (listed price, sellers, nearest seller, installments, specs).",
        "parameters": {"type": "object", "properties": {"product_ids": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 3}},
                       "required": ["product_ids"]}}},
    {"type": "function", "function": {
        "name": "similar_products",
        "description": "Similar products to one product (same category, close price).",
        "parameters": {"type": "object", "properties": {"product_id": {"type": "string"}}, "required": ["product_id"]}}},
    {"type": "function", "function": {
        "name": "get_shop",
        "description": "One store: open status now, today's hours, where it is in its mall, payment options.",
        "parameters": {"type": "object", "properties": {"shop_id": {"type": "string"}}, "required": ["shop_id"]}}},
    {"type": "function", "function": {
        "name": "ask_user",
        "description": "Ask ONE short clarifying question with 2–4 tappable answers. Ends your turn.",
        "parameters": {"type": "object", "properties": {"question": {"type": "string"},
                                                       "options": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 4}},
                       "required": ["question", "options"]}}},
    {"type": "function", "function": {
        "name": "propose_inquiry",
        "description": "Offer to ask 1–3 stores about a product (price today, stock, hours, exact location, installments). "
                       "Shows a confirm button; nothing is sent until the user taps it. Ends your turn.",
        "parameters": {"type": "object", "properties": {
            "shop_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
            "product_id": {"type": "string"},
            "questions": {"type": "array", "items": {"type": "string", "enum": ["price", "stock", "hours", "location", "installments"]}},
            "detail": {"type": "string", "description": "Size or colour to ask about, if the user gave one"}},
            "required": ["shop_ids", "questions"]}}},
    {"type": "function", "function": {
        "name": "propose_plan",
        "description": "Offer to add 1–3 stores to the user's visit plan. Shows a confirm button. Ends your turn.",
        "parameters": {"type": "object", "properties": {"shop_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
                                                       "product_id": {"type": "string"}}, "required": ["shop_ids"]}}},
]

RUNNING = {
    "search_products": "دارم کالاها را می‌گردم…", "find_sellers": "دارم فروشنده‌های نزدیک را مقایسه می‌کنم…",
    "compare_products": "دارم مقایسه می‌کنم…", "similar_products": "دارم مدل‌های مشابه را پیدا می‌کنم…",
    "get_shop": "دارم اطلاعات فروشگاه را می‌خوانم…",
}
TERMINAL = {"ask_user", "propose_inquiry", "propose_plan"}


@dataclass
class Ctx:
    at: datetime
    lat: float | None
    lng: float | None
    location_name: str | None
    seen_products: dict[str, str] = field(default_factory=dict)  # id → title, for the done summary
    searches: int = 0  # only the first search in a turn becomes a block; repeats just inform the model


@dataclass
class Result:
    for_model: dict
    blocks: list = field(default_factory=list)
    done: str | None = None


def _card_brief(c) -> dict:
    return {"id": c.id, "title": c.title[:80], "price_min": c.price_range.min, "price_max": c.price_range.max,
            "sellers": c.seller_count, "nearest_m": round(c.nearest_distance_m) if c.nearest_distance_m else None,
            "freshest_price": c.freshest, "reasons": c.reasons}


def search_products(ctx: Ctx, query: str, max_price: int | None = None, min_price: int | None = None,
                    installments: bool = False, open_now: bool = False, **_ignored) -> Result:
    # Always the search page's «مرتبط‌ترین» order, so the 3 suggestions are the top 3 of «همه‌ی نتیجه‌ها».
    # A model-chosen sort="nearest" (for «نزدیک فردوسی») used to put the nearest accessories first; distance
    # belongs to find_sellers. `**_ignored` absorbs a `sort` from older prompts or a creative model.
    pay = ["installments"] if installments else []
    p = search.Params(q=query, min=min_price, max=max_price, pay=pay, open=open_now, lat=ctx.lat, lng=ctx.lng)
    out = search.search(p, ctx.at)
    ctx.searches += 1
    ranked = list(out.items)
    items = ranked[:3] if ctx.searches == 1 else []
    for c in items:
        ctx.seen_products[c.id] = c.title
    near = f" نزدیک {ctx.location_name}" if ctx.location_name else ""
    # The «همه‌ی نتیجه‌ها» link carries the same filters, so the search page opens on what the block showed.
    link = [("q", query)] + [(k, str(v)) for k, v in (("min", min_price), ("max", max_price)) if v is not None] \
        + [("pay", k) for k in pay] + ([("open", "1")] if open_now else [])
    blocks = [ProductListBlock(title=f"{fa.digits(len(items))} پیشنهاد برای تو" if items else "چیزی پیدا نشد",
                               items=items, query=query, search=urlencode(link), total=out.total)] if items else []
    model = {"total": out.total, "understood": [c.label for c in out.understood_chips],
             "items": [_card_brief(c) for c in ranked[:5]],
             "excluded_unknown": out.excluded_unknown, "relax": out.relax.label if out.relax else None,
             "note": "Prices are listed by stores (not verified). Stock is unknown until a seller answers."}
    if ctx.searches > 1:
        return Result(model, [], None)
    return Result(model, blocks, f"{fa.digits(out.total)} کالا{near} پیدا کردم" if out.total else "با این شرط‌ها کالایی پیدا نکردم")


def find_sellers(ctx: Ctx, product_id: str, mode: str = "balanced", installments: bool = False,
                 open_now: bool = False) -> Result:
    out = sellers_of(product_id, ctx.at, ctx.lat, ctx.lng, mode if mode in MODE_LABEL else "balanced", "walk",
                     ["installments"] if installments else [], False, open_now)
    prod = product_ref(product_id)
    if out is None or prod is None:
        return Result({"error": "product not found"})
    ctx.seen_products[prod.id] = prod.title
    rows = out.listed[:3]
    model = {"product": prod.title, "total_listed": len(out.listed), "related_stores": len(out.related),
             "rows": [{"shop_id": r.shop.id, "name": r.shop.name, "price": r.price.value, "price_kind": r.price.kind,
                       "freshness": r.price.freshness, "stock": r.stock.state, "distance_m": round(r.distance_m) if r.distance_m else None,
                       "open_now": r.open_now.label_fa, "installments": r.payment.installments, "reasons": r.reasons,
                       "where": r.shop.location.mall.name if r.shop.location.mall else r.shop.address_short} for r in out.listed[:6]],
             "note": "tier=listed means the product is in that store's listing; stock still unknown unless stock=in_stock."}
    blocks = [SellerListBlock(product=prod, mode_label=MODE_LABEL.get(mode, "متعادل"), rows=rows, total=len(out.listed))] if rows else []
    return Result(model, blocks, f"{fa.digits(len(out.listed))} فروشنده را مقایسه کردم")


def compare_products(ctx: Ctx, product_ids: list[str]) -> Result:
    ids = list(dict.fromkeys(product_ids))[:3]
    out = products.compare(ids, ctx.lat, ctx.lng)
    if len(out.columns) < 2:
        return Result({"error": "need two known products"})
    cols = [product_ref(c.id) for c in out.columns]
    model = {"columns": [{"id": c.id, "title": c.title[:60], "best_for": c.best_for} for c in out.columns],
             "rows": [{"key": r.key, "values": r.values, "leader_index": r.leader} for r in out.summary]}
    return Result(model, [CompareBlock(ids=[c.id for c in out.columns], columns=[c for c in cols if c], rows=out.summary)],
                  f"{fa.digits(len(out.columns))} کالا را مقایسه کردم")


def similar_products(ctx: Ctx, product_id: str) -> Result:
    items = (products.similar(product_id, 6, ctx.lat, ctx.lng) or [])[:3]
    return Result({"items": [_card_brief(c) for c in items]},
                  [ProductListBlock(title="مدل‌های مشابه", items=items)] if items else [],
                  f"{fa.digits(len(items))} مدل مشابه پیدا کردم")


def get_shop(ctx: Ctx, shop_id: str) -> Result:
    d = places.shop_detail(shop_id, ctx.at, ctx.lat, ctx.lng)
    if not d:
        return Result({"error": "shop not found"})
    today = next((h for h in (d.hours or []) if h.is_today), None)
    hours = None if not today or today.ranges is None else ("تعطیل" if not today.ranges else fa.digits(" و ".join(today.ranges)))
    model = {"name": d.shop.name, "open_now": d.open_status.label_fa, "hours_today": hours,
             "mall": d.shop.location.mall.name if d.shop.location.mall else None, "floor": d.shop.location.floor_label,
             "unit": d.shop.location.unit, "address": d.address, "payment": d.payment.model_dump(),
             "distance_m": round(d.distance_m) if d.distance_m else None}
    return Result(model, [ShopCardBlock(shop=d.shop, open_now=d.open_status, payment=d.payment, hours_today=hours)],
                  f"اطلاعات {d.shop.name} را خواندم")


def ask_user(ctx: Ctx, question: str, options: list[str]) -> Result:
    return Result({"shown": True}, [QuestionBlock(question=question.strip(), options=[o.strip() for o in options[:4]])])


def _shops(ids: list[str]) -> list[ShopMini]:
    from app.inquiries.facts import shop_row
    out = []
    for i in dict.fromkeys(ids):
        s = shop_row(i)
        if s:
            out.append(ShopMini(id=s["shop_id"], name=s["name"], lat=s["lat"], lng=s["lng"], mall_id=s["mall_id"]))
    return out


def propose_inquiry(ctx: Ctx, shop_ids: list[str], questions: list[str], product_id: str | None = None,
                    detail: str | None = None) -> Result:
    shops = _shops(shop_ids[:3])
    if not shops:
        return Result({"error": "unknown shops"})
    qs = [q for q in dict.fromkeys(questions) if q in LABELS] or ["price", "stock"]
    prod: InquiryProduct | None = product_ref(product_id) if product_id else None
    labels = [LABELS[q] + (f" {fa.digits(detail)}" if q == "stock" and detail else "") for q in qs]
    summary = "، ".join(s.name for s in shops) + "؛ " + "، ".join(labels)
    return Result({"shown_confirm": True},
                  [InquiryConfirmBlock(product=prod, shops=shops, questions=qs, summary=summary, detail=detail)])


def propose_plan(ctx: Ctx, shop_ids: list[str], product_id: str | None = None) -> Result:
    shops = _shops(shop_ids[:3])
    if not shops:
        return Result({"error": "unknown shops"})
    return Result({"shown_confirm": True},
                  [PlanConfirmBlock(shops=shops, product=product_ref(product_id) if product_id else None,
                                    summary="، ".join(s.name for s in shops))])


FUNCS = {f.__name__: f for f in (search_products, find_sellers, compare_products, similar_products, get_shop,
                                 ask_user, propose_inquiry, propose_plan)}


def run(ctx: Ctx, name: str, raw_args: str) -> Result:
    fn = FUNCS.get(name)
    if fn is None:
        return Result({"error": f"unknown tool {name}"})
    try:
        args = json.loads(raw_args or "{}")
    except ValueError:
        return Result({"error": "arguments were not valid JSON"})
    try:
        return fn(ctx, **{k: v for k, v in args.items() if v is not None})
    except TypeError as e:
        return Result({"error": f"bad arguments: {e}"})
