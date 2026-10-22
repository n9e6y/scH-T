"""Row → view-model helpers shared by the routers. All Persian labels are built here, not in web/."""
from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache

from app import fa, freshness
from app.db import meta
from app.hours import open_status as compute_open_status
from app.models import Location, MallRef, OpensAt, OpenStatus, Payment, Price, ShopRef

TRUST_SUMMARY = "قیمت‌ها ثبت‌شده‌اند؛ موجودی را باید از فروشنده پرسید."


@lru_cache(maxsize=1)
def _snapshot(value: str) -> datetime:
    return datetime.fromisoformat(value)


def snapshot() -> datetime:
    return _snapshot(meta()["snapshot_date"])


def week_of(row) -> dict[int, list[tuple[int, int]]] | None:
    raw = row["hours_json"]
    if not raw:
        return None
    return {int(k): [tuple(r) for r in v] for k, v in json.loads(raw).items()}


def open_status_label(state: str, closes_at: str | None, opens_at: dict | None, minutes_left: int | None) -> str:
    if state == "open":
        return f"باز است، تا {fa.digits(closes_at)}" if closes_at else "باز است"
    if state == "closing_soon":
        return f"{fa.digits(minutes_left)} دقیقه دیگر می‌بندد" if minutes_left is not None else "به‌زودی می‌بندد"
    if state == "closed":
        if not opens_at:
            return "بسته است"
        when = {0: "", 1: "فردا "}.get(opens_at["days_ahead"], f"{fa.WEEKDAYS_FA[opens_at['weekday']]} ")
        return f"بسته است، {when}{fa.digits(opens_at['time'])} باز می‌شود"
    return "ساعت کاری نامشخص"


def open_status_view(row, at: datetime) -> OpenStatus:
    st = compute_open_status(week_of(row), at)
    minutes_left = None
    if st.closes_at and st.state in ("open", "closing_soon"):
        h, m = map(int, st.closes_at.split(":"))
        close_min = h * 60 + m
        now_min = at.hour * 60 + at.minute
        minutes_left = (close_min - now_min) % 1440 or 1440
    opens = None
    if st.opens_at:
        opens = OpensAt(weekday=st.opens_at["weekday"], weekday_fa=fa.WEEKDAYS_FA[st.opens_at["weekday"]],
                        time=st.opens_at["time"], days_ahead=st.opens_at["days_ahead"])
    return OpenStatus(state=st.state, label_fa=open_status_label(st.state, st.closes_at, st.opens_at, minutes_left),
                      closes_at=st.closes_at, opens_at=opens, minutes_to_close=minutes_left, at=at.isoformat())


def tri(v) -> bool | None:
    return None if v is None else bool(v)


def payment_view(row) -> Payment:
    types = json.loads(row["installment_types"]) if row["installment_types"] else []
    return Payment(installments=tri(row["installments"]), torob_pay=tri(row["torob_pay"]),
                   kala_barg=tri(row["kala_barg"]), fast_delivery=tri(row["fast_delivery"]),
                   installment_types=types)


def location_view(row) -> Location:
    mall = MallRef(id=row["mall_id"], name=row["mall_name"]) if row["mall_id"] else None
    if row["floor_label"] is not None and (row["unit"] or mall):
        state = "known"
    elif mall:
        state = "mall_only"
    else:
        state = "unknown"
    return Location(mall=mall, floor_label=row["floor_label"], floor_order=row["floor_order"],
                    unit=row["unit"], state=state)


def shop_ref(row) -> ShopRef:
    return ShopRef(id=row["shop_id"], name=row["name"], is_real_name=bool(row["is_real_name"]), area=row["area"],
                   address_short=row["address_short"] or "", lat=row["lat"], lng=row["lng"],
                   location=location_view(row))


def price_view(value: int | None, changed_at: str | None, outlier: int = 0) -> Price:
    if value is None or value <= 0 or outlier:
        return Price(value=None, kind="none", freshness=None, changed_at=changed_at)
    return Price(value=value, kind="listed", freshness=freshness.tier(changed_at, snapshot()), changed_at=changed_at)


def first_image(raw: str | None) -> str | None:
    try:
        imgs = json.loads(raw or "[]")
    except ValueError:
        return None
    return imgs[0] if imgs else None
