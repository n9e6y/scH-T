from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from app import clock, places, products
from app import search as search_svc
from app import sellers as sellers_svc
from app.errors import not_found
from app.models import (CompareIn, CompareOut, MallDetail, MallNear, ProductDetail, SearchOut, SellersOut,
                        ShopDetail, ShopOffersOut, SimilarItem)

router = APIRouter()
PayKey = Literal["installments", "torob_pay", "kala_barg"]


@router.get("/search", response_model=SearchOut)
def search(request: Request, q: str = "", cat: str | None = None, brand: str | None = None,
           min: int | None = None, max: int | None = None, pay: Annotated[list[PayKey], Query()] = [],
           fast: bool = False, open: bool = False, lat: float | None = None, lng: float | None = None,
           radius: float | None = None,
           sort: Literal["relevance", "cheapest", "nearest", "most_sellers"] = "relevance",
           page: int = Query(1, ge=1)):
    p = search_svc.Params(q=q, cat=cat, brand=brand, min=min, max=max, pay=list(pay), fast=fast, open=open,
                          lat=lat, lng=lng, radius=radius, sort=sort, page=page)
    return search_svc.search(p, clock.now(request))


@router.get("/products/{product_id}", response_model=ProductDetail)
def product(product_id: str):
    return products.detail(product_id) or _raise(not_found("کالا"))


@router.get("/products/{product_id}/sellers", response_model=SellersOut)
def product_sellers(request: Request, product_id: str, lat: float | None = None, lng: float | None = None,
                    mode: Literal["balanced", "cheapest", "nearest"] = "balanced",
                    travel: Literal["walk", "car"] = "walk", pay: Annotated[list[PayKey], Query()] = [],
                    fast: bool = False, open: bool = False, radius: float | None = None):
    out = sellers_svc.sellers(product_id, clock.now(request), lat, lng, mode, travel, list(pay), fast, open, radius)
    return out or _raise(not_found("کالا"))


@router.get("/products/{product_id}/similar", response_model=list[SimilarItem])
def product_similar(product_id: str, k: int = Query(10, ge=1, le=30), lat: float | None = None,
                    lng: float | None = None):
    out = products.similar(product_id, k, lat, lng)
    return out if out is not None else _raise(not_found("کالا"))


@router.post("/compare", response_model=CompareOut)
def compare(body: CompareIn):
    return products.compare(body.ids, body.lat, body.lng)


@router.get("/shops/{shop_id}", response_model=ShopDetail)
def shop(request: Request, shop_id: str):
    return places.shop_detail(shop_id, clock.now(request)) or _raise(not_found("فروشگاه"))


@router.get("/shops/{shop_id}/offers", response_model=ShopOffersOut)
def shop_offers(shop_id: str, q: str = "", page: int = Query(1, ge=1)):
    return places.shop_offers(shop_id, q, page)


@router.get("/malls/near", response_model=list[MallNear])
def malls_near(request: Request, lat: float, lng: float, limit: int = Query(8, ge=1, le=30)):
    return places.malls_near(lat, lng, clock.now(request), limit)


@router.get("/malls/{mall_id}", response_model=MallDetail)
def mall(request: Request, mall_id: int):
    return places.mall_detail(mall_id, clock.now(request)) or _raise(not_found("پاساژ"))


def _raise(e: Exception):
    raise e
