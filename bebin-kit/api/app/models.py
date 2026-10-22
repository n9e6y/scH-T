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
    stock: Stock = Stock()


class Facet(BaseModel):
    key: str
    label: str
    count: int


class SearchOut(BaseModel):
    query: str
    text: str
    understood_chips: list[Chip]
    items: list[ProductCard]
    total: int
    page: int
    has_more: bool
    excluded_unknown: dict[str, int] = Field(default_factory=dict)
    facets: dict[str, list[Facet]] = Field(default_factory=dict)
    price_quartiles: list[int] = Field(default_factory=list)
    relax: Chip | None = Field(None, description="The most restrictive filter to drop when results are empty")
    needfinder: None = None


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


class CompareOut(BaseModel):
    columns: list[CompareColumn]
    specs: list[CompareRow]


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
    verifications: list[dict] = []


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
