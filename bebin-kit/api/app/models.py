"""Response models. The OpenAPI generated from these is the contract with web/ (`make types`).

Trust fields follow ARCHITECTURE §12: price {value, kind, freshness, changed_at, verified_at},
stock {state, verified_at}, tier, open_status, distance_m, eta_min, reasons[].
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Freshness = Literal["fresh", "aging", "stale", "unknown"]
OpenState = Literal["open", "closing_soon", "closed", "unknown"]
Travel = Literal["walk", "car"]
Mode = Literal["balanced", "cheapest", "nearest"]


class ErrorOut(BaseModel):
    code: str
    message_fa: str


# ---------------------------------------------------------------- trust primitives
class Price(BaseModel):
    value: int | None = Field(description="Toman. None means «قیمت ثبت نشده».")
    kind: Literal["listed", "verified", "none"]
    freshness: Freshness | None = None
    changed_at: str | None = Field(None, description="ISO time of the last listed price change")
    verified_at: str | None = None
    listed_value: int | None = Field(None, description="The listed price, kept when kind=verified")


class PriceRange(BaseModel):
    min: int | None
    max: int | None


class Stock(BaseModel):
    state: Literal["unknown", "in_stock", "out_of_stock"] = "unknown"
    verified_at: str | None = None
    note: str | None = None


class OpensAt(BaseModel):
    weekday: int
    weekday_fa: str
    time: str
    days_ahead: int


class OpenStatus(BaseModel):
    state: OpenState
    label_fa: str
    closes_at: str | None = None
    opens_at: OpensAt | None = None
    minutes_to_close: int | None = None
    at: str = Field(description="The moment this status was computed for (now or estimated arrival)")


class Payment(BaseModel):
    installments: bool | None
    torob_pay: bool | None
    kala_barg: bool | None
    fast_delivery: bool | None
    installment_types: list[str] = []


class MallRef(BaseModel):
    id: int
    name: str


class Location(BaseModel):
    mall: MallRef | None = None
    floor_label: str | None = None
    floor_order: int | None = None
    unit: str | None = None
    state: Literal["known", "mall_only", "unknown"]


class ShopRef(BaseModel):
    id: str
    name: str
    is_real_name: bool
    area: str | None
    address_short: str
    lat: float
    lng: float
    location: Location


class Chip(BaseModel):
    key: str
    label: str
    value: str | int | None = None
    id: str = Field("", description="Pass back as `ign` to drop this understood filter («pay:installments», «max»)")


class Reasoned(BaseModel):
    reasons: list[str] = Field(default_factory=list, description="1–3 Persian reasons, ≤40 chars each")


# ---------------------------------------------------------------- meta
class Area(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    shop_count: int


class CategoryGroup(BaseModel):
    key: str
    label: str
    product_count: int
    shop_count: int


class Caveat(BaseModel):
    key: str
    text_fa: str


class Meta(BaseModel):
    snapshot_date: str
    counts: dict[str, int]
    flags: dict[str, bool | str | float]
    caveats: list[Caveat]
    now: str


# ---------------------------------------------------------------- products
class ProductCard(Reasoned):
    id: str
    title: str
    brand: str | None
    model: str | None
    category: str
    image: str | None
    price_range: PriceRange
    seller_count: int
    nearby_seller_count: int | None = None
    nearest_distance_m: float | None = None
    freshest: Freshness
    price_changed_at: str | None = Field(None, description="Last price change of the freshest passing seller")
    stock: Stock = Stock()


class Facet(BaseModel):
    key: str
    label: str
    count: int


class Applied(BaseModel):
    """The filters actually in effect: URL params merged with what was understood from the query text."""
    cat: str | None = None
    min: int | None = None
    max: int | None = None
    pay: list[str] = Field(default_factory=list)
    fast: bool = False
    open: bool = False
    radius: float | None = Field(None, description="km; None = any distance")
    brand: list[str] = Field(default_factory=list)
    area: str | None = Field(None, description="Area preset named in the query; it becomes the distance origin")
    unknown: bool = Field(False, description="Sellers whose status is unknown for an active filter are included")
    sort: str = "relevance"
    boost: list[str] = Field(default_factory=list, description="Need-finder ranking boost keywords")


class RelaxOption(BaseModel):
    key: str = Field(description="Filter to drop: pay | max | min | open | fast | radius | brand")
    value: str | None = Field(None, description="For pay: which method")
    label: str = Field(description="Row label, e.g. «بدون اقساطی»")
    action: str = Field(description="Button label, e.g. «بدون فیلتر اقساطی ببین»")
    count: int = Field(description="Products found if only this filter is dropped")


class NeedOption(BaseModel):
    label: str
    min: int | None = None
    max: int | None = None
    brand: str | None = None
    boost: list[str] | None = Field(None, description="Ranking boost keywords (use question)")


class NeedQuestion(BaseModel):
    key: Literal["use", "brand", "budget"]
    label: str = Field(description="Collapsed-row label, e.g. «برند»")
    question: str
    options: list[NeedOption]


class SearchOut(BaseModel):
    query: str
    text: str
    understood_chips: list[Chip]
    items: list[ProductCard]
    total: int
    page: int
    has_more: bool
    applied: Applied = Applied()
    excluded_unknown: dict[str, int] = Field(default_factory=dict, description="Products dropped only for unknowns")
    unknown_sellers: dict[str, int] = Field(
        default_factory=dict, description="Shops whose status is unknown for an active filter (excluded unless applied.unknown)")
    facets: dict[str, list[Facet]] = Field(default_factory=dict)
    price_quartiles: list[int] = Field(default_factory=list)
    price_bounds: PriceRange = PriceRange(min=None, max=None)
    relax: Chip | None = Field(None, description="The most restrictive filter to drop when results are empty")
    relax_options: list[RelaxOption] = Field(default_factory=list)
    relax_note: str | None = Field(None, description="Why nothing matched, in Persian")
    needfinder: list[NeedQuestion] = Field(default_factory=list, description="Open questions, at most 2, data-derived")


class Spec(BaseModel):
    key: str
    value: str


class ProductDetail(BaseModel):
    id: str
    title: str
    brand: str | None
    model: str | None
    category: str
    category_group: str
    images: list[str]
    specs: list[Spec]
    key_specs: list[Spec]
    price_range: PriceRange
    seller_count: int
    latest_change: str | None
    freshest: Freshness
    stock: Stock = Stock()
    trust_summary: str


class Components(BaseModel):
    price: float
    distance: float
    open: float
    fresh: float
    verified: float


class Warranty(BaseModel):
    months: int | None
    text: str | None


class SellerRow(Reasoned):
    tier: Literal["listed"] = "listed"
    shop: ShopRef
    offer_id: str
    seller_title: str
    price: Price
    stock: Stock
    distance_m: float | None
    eta_min: float | None
    travel: Travel
    open_status: OpenStatus
    open_now: OpenStatus
    payment: Payment
    warranty: Warranty
    score: float
    components: Components
    unknown_factors: list[str] = Field(default_factory=list, description="Components scored at a neutral value because the data is missing")
    arrival_note: str | None = Field(None, description="Set when the status at arrival differs from now")
    rank: int


class RelatedRow(BaseModel):
    tier: Literal["related"] = "related"
    shop: ShopRef
    distance_m: float | None
    eta_min: float | None
    open_status: OpenStatus
    payment: Payment
    reasons: list[str]
    note: str


class SellersOut(BaseModel):
    product_id: str
    mode: Mode
    weights: dict[str, float]
    travel: Travel
    has_location: bool
    listed: list[SellerRow]
    related: list[RelatedRow]
    unavailable: list[SellerRow] = []
    excluded_unknown: dict[str, int] = Field(default_factory=dict)
    excluded_other: int = 0
    related_note: str


class SimilarItem(ProductCard):
    pass


class CompareIn(BaseModel):
    ids: list[str] = Field(min_length=2, max_length=4)
    lat: float | None = None
    lng: float | None = None


class CompareColumn(BaseModel):
    id: str
    title: str
    brand: str | None
    image: str | None
    price_range: PriceRange
    seller_count: int
    nearby_seller_count: int | None
    nearest: ShopRef | None
    nearest_distance_m: float | None
    payments: list[str]
    warranty: str | None
    best_for: list[str]
    verdict: str | None = None


class CompareRow(BaseModel):
    key: str
    values: list[str | None]
    differs: bool
    leader: int | None = Field(None, description="Column index that leads this row (soil dot), if any")
    ltr: bool = False


class CompareOut(BaseModel):
    columns: list[CompareColumn]
    summary: list[CompareRow] = Field(default_factory=list, description="Listing facts: price, sellers, nearest, installments, last change")
    specs: list[CompareRow]
    verdict_source: Literal["llm", "rules"] = "rules"


# ---------------------------------------------------------------- shops and malls
class HoursDay(BaseModel):
    weekday: int
    weekday_fa: str
    ranges: list[str] | None = Field(description="None = unknown; [] = closed")
    is_today: bool


class ShopDetail(BaseModel):
    shop: ShopRef
    categories: list[str]
    address: str
    open_status: OpenStatus
    hours: list[HoursDay] | None
    payment: Payment
    phone: str | None
    phone_is_fictitious: bool = True
    instagram: str | None
    website: str | None
    offer_count: int
    distance_m: float | None = None
    eta_min: float | None = None
    verifications: list["ShopVerification"] = []


class ShopOffer(BaseModel):
    product_id: str
    offer_id: str
    title: str
    image: str | None
    price: Price


class ShopOffersOut(BaseModel):
    items: list[ShopOffer]
    total: int
    page: int
    has_more: bool


class MallShop(BaseModel):
    id: str
    name: str
    unit: str | None
    open_status: OpenStatus
    primary_category: str | None


class MallFloor(BaseModel):
    floor_label: str
    floor_order: int | None
    shops: list[MallShop]


class MallDetail(BaseModel):
    id: int
    name: str
    address: str
    area: str | None
    lat: float
    lng: float
    shop_count: int
    open_count: int
    distance_m: float | None = None
    eta_min: float | None = None
    floors: list[MallFloor]


class MallNear(BaseModel):
    id: int
    name: str
    area: str | None
    lat: float
    lng: float
    shop_count: int
    open_count: int
    distance_m: float | None
    eta_min: float | None


# ---------------------------------------------------------------- inquiries (M4)
QuestionKey = Literal["price", "stock", "hours", "location", "installments", "hold", "has_model"]


class InquiryProduct(BaseModel):
    id: str
    title: str
    model: str | None
    image: str | None


class InquiryStep(BaseModel):
    key: str
    label: str
    state: Literal["done", "answered", "failed", "out", "waiting", "pending"]
    at: str | None = Field(None, description="HH:MM, Persian digits")


class AnswerField(BaseModel):
    key: str
    label: str
    value: str | None = Field(None, description="None = the seller skipped this question")
    sub: str | None = None


class InquiryOut(BaseModel):
    id: str
    status: Literal["sent", "delivered", "seen", "answered", "no_answer", "cancelled"]
    outcome: Literal["waiting", "answered", "out_of_stock", "no_answer", "cancelled"]
    shop: ShopRef
    product: InquiryProduct | None
    tier: Literal["listed", "related"]
    questions: list[str]
    ask_text: str = Field(description="The questions as the shopper sent them")
    detail: str | None
    hold_until: str | None
    note: str | None
    channel: Literal["simulated", "panel"]
    simulated: bool
    created_at: str
    updated_at: str
    answered_at: str | None
    unread: bool
    steps: list[InquiryStep]
    answers: list[AnswerField]
    message: str | None
    preview: str
    failure_note: str | None
    listed_note: str | None = Field(None, description="What the listing said, shown under an answer")
    can_nudge: bool
    can_cancel: bool
    open_now: OpenStatus
    buyer: str = Field(description="How the seller panel names the shopper")
    buyer_distance_m: float | None = None


class InquiryIn(BaseModel):
    shop_ids: list[str] = Field(min_length=1, max_length=5)
    product_id: str | None = None
    questions: list[QuestionKey] = Field(min_length=1)
    detail: str | None = Field(None, max_length=60, description="Size/colour for the stock question")
    hold_until: str | None = Field(None, max_length=20)
    note: str | None = Field(None, max_length=300)
    lat: float | None = None
    lng: float | None = None


class InquiryGroup(BaseModel):
    product: InquiryProduct | None
    items: list[InquiryOut]


class InquiriesOut(BaseModel):
    groups: list[InquiryGroup]
    unread: int
    counts: dict[str, int] = Field(description="all | waiting | answered | no_answer")


class ComposeQuestion(BaseModel):
    key: QuestionKey
    label: str
    hint: str
    checked: bool
    field: Literal["detail", "hold"] | None = None


class ComposeRecipient(BaseModel):
    id: str
    name: str
    open_now: OpenStatus


class ComposeOut(BaseModel):
    title: str
    recipients: list[ComposeRecipient]
    product: InquiryProduct | None
    questions: list[ComposeQuestion]
    hold_options: list[str]
    eta_note: str
    closed_note: str | None = None
    open_alternatives: list[ComposeRecipient] = Field(default_factory=list, description="Open listed sellers to ask instead")


class AltItem(BaseModel):
    kind: Literal["shop", "product"]
    shop_id: str | None = None
    shop_name: str | None = None
    product_id: str | None = None
    title: str
    model: str | None = None
    reason: str
    action: Literal["route", "ask", "view"]
    action_label: str
    primary: bool = False
    lat: float | None = None
    lng: float | None = None


class AltTier(BaseModel):
    key: Literal["same_product", "same_shop", "similar_nearby", "related"]
    title: str
    items: list[AltItem]


class AlternativesOut(BaseModel):
    tiers: list[AltTier]
    note: str | None = None


class SellerReplyIn(BaseModel):
    stock: Literal["in_stock", "out_of_stock"] | None = None
    stock_detail: str | None = Field(None, max_length=60)
    price: int | None = Field(None, gt=0)
    hours_today: str | None = Field(None, max_length=40)
    location: str | None = Field(None, max_length=80)
    installments: str | None = Field(None, max_length=80)
    hold: str | None = Field(None, max_length=40)
    message: str | None = Field(None, max_length=400)


class SellerShop(BaseModel):
    id: str
    name: str
    place: str
    new_count: int = 0


class SellerInboxItem(BaseModel):
    inquiry: InquiryOut
    prefill_price: int | None
    prefill_location: str | None
    hour_options: list[str]


class SellerInboxOut(BaseModel):
    shop: SellerShop
    new: list[SellerInboxItem]
    answered: list[InquiryOut]


class ShopVerification(BaseModel):
    text: str
    value: str | None = None
    verified_at: str
    today: bool


class DemoOverrideIn(BaseModel):
    shop_id: str
    outcome: Literal["answer", "out_of_stock", "no_answer", "price_up"] | None


class DemoState(BaseModel):
    enabled: bool
    speed: float
    overrides: dict[str, str]


ShopDetail.model_rebuild()


# ---------------------------------------------------------------- assistant (M5): UI blocks streamed over SSE
class ShopMini(BaseModel):
    id: str
    name: str
    lat: float | None = None
    lng: float | None = None
    mall_id: int | None = None


class ProductListBlock(BaseModel):
    type: Literal["product_list"] = "product_list"
    title: str
    items: list[ProductCard]
    query: str | None = Field(None, description="Opens the full results in search")
    total: int = 0
    plain: bool = Field(False, description="No AI reasons (fallback search)")


class SellerListBlock(BaseModel):
    type: Literal["seller_list"] = "seller_list"
    product: InquiryProduct
    mode_label: str
    rows: list[SellerRow]
    total: int


class QuestionBlock(BaseModel):
    type: Literal["question_chips"] = "question_chips"
    question: str
    options: list[str]


class InquiryConfirmBlock(BaseModel):
    type: Literal["inquiry_confirm"] = "inquiry_confirm"
    product: InquiryProduct | None
    shops: list[ShopMini]
    questions: list[QuestionKey]
    summary: str
    detail: str | None = None


class CompareBlock(BaseModel):
    type: Literal["compare"] = "compare"
    ids: list[str]
    columns: list[InquiryProduct]
    rows: list[CompareRow]


class ShopCardBlock(BaseModel):
    type: Literal["shop_card"] = "shop_card"
    shop: ShopRef
    open_now: OpenStatus
    payment: Payment
    hours_today: str | None = None


class PlanConfirmBlock(BaseModel):
    type: Literal["plan_confirm"] = "plan_confirm"
    shops: list[ShopMini]
    product: InquiryProduct | None = None
    summary: str


class NoticeBlock(BaseModel):
    type: Literal["notice"] = "notice"
    level: Literal["info", "wilt"]
    text: str


AssistantBlock = (ProductListBlock | SellerListBlock | QuestionBlock | InquiryConfirmBlock | CompareBlock |
                  ShopCardBlock | PlanConfirmBlock | NoticeBlock)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatContext(BaseModel):
    location_name: str | None = None
    lat: float | None = None
    lng: float | None = None
    compare_ids: list[str] = Field(default_factory=list)
    plan_shop_ids: list[str] = Field(default_factory=list)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    context: ChatContext = ChatContext()


class AssistantSchema(BaseModel):
    """Not an endpoint payload: exposes the SSE block types to `make types`."""
    block: AssistantBlock
    chat_in: ChatIn


# ---------------------------------------------------------------- visit plan (M6, F12)
class PlanStopIn(BaseModel):
    shop_id: str
    product_id: str | None = None


class PlanIn(BaseModel):
    stops: list[PlanStopIn] = Field(min_length=1, max_length=8)
    lat: float | None = None
    lng: float | None = None
    start_label: str | None = None
    start_at: str | None = Field(None, description="ISO time; default = now (demo clock honoured)")
    mode: Literal["walk", "car"] = "walk"
    optimize: bool = Field(True, description="False keeps the given order (after a manual drag)")


class PlanSub(BaseModel):
    shop_id: str
    name: str
    unit: str | None
    item: str | None
    verified: str | None = Field(None, description="Today's verification text (stamp)")
    verified_old: str | None = Field(None, description="An older verification, greyed «قدیمی شده»")


class PlanAlt(BaseModel):
    shop_id: str
    name: str
    reason: str
    product_id: str | None = None


class PlanStopOut(BaseModel):
    key: str = Field(description="Stable id of the stop: mall:<id> or the shop id")
    shop_ids: list[str]
    title: str
    place: str
    lat: float
    lng: float
    leg: str
    arrive: str
    status: Literal["open", "closing", "closed_on_arrival", "closed_now", "unknown"]
    status_text: str
    subs: list[PlanSub]
    alternative: PlanAlt | None = None
    can_ask: bool


class PlanOut(BaseModel):
    start_text: str
    stops: list[PlanStopOut]
    end_text: str
    end_short: str
    meta: str
    warnings: int
    banner: str | None = None
    banner_start_at: str | None = Field(None, description="Start time that makes every stop open")
    banner_start_label: str | None = None
    footer_title: str
    footer_sub: str
    nav_url: str | None
    demo_clock: bool
