from datetime import datetime, timezone

from app import fa
from app.freshness import tier
from app.geo import eta_min, haversine_m, route_km

SNAP = datetime(2026, 10, 13, 0, 2, tzinfo=timezone.utc)


def test_freshness_tiers():
    assert tier("2026-10-12T10:00:00+00:00", SNAP) == "fresh"
    assert tier("2026-10-05T10:00:00+00:00", SNAP) == "aging"
    assert tier("2026-09-01T10:00:00+00:00", SNAP) == "stale"
    assert tier(None, SNAP) == "unknown"
    assert tier("garbage", SNAP) == "unknown"


def test_geo():
    d = haversine_m(35.6950, 51.4071, 35.7022, 51.4071)
    assert 790 < d < 810
    assert abs(route_km(35.6950, 51.4071, 35.7022, 51.4071) - d * 1.35 / 1000) < 1e-9
    assert round(eta_min(1.08, "walk")) == 14
    assert round(eta_min(1.08, "car")) == 4


def test_fa_formatting():
    assert fa.number(3850000) == "۳٬۸۵۰٬۰۰۰"
    assert fa.distance(800) == "۸۰۰ متر"
    assert fa.distance(978) == "۱ کیلومتر"
    assert fa.distance(1240) == "۱٫۲ کیلومتر"
    assert fa.distance(3000) == "۳ کیلومتر"
    assert fa.minutes(10) == "۱۰ دقیقه"
    assert fa.minutes(75) == "۱ ساعت و ۱۵ دقیقه"
    assert fa.price_short(3_700_000) == "۳٫۷ میلیون"
    assert fa.price_short(4_000_000) == "۴ میلیون"


def test_jalali_dates():
    from app.fa import jalali, to_jalali
    assert to_jalali(2026, 10, 19) == (1405, 7, 27)
    assert to_jalali(2025, 3, 21) == (1404, 1, 1)
    assert jalali("2026-10-12T21:21:18+00:00") == "۲۱ مهر"  # 00:51 on 13 Oct in Tehran
