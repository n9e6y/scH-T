"""Persian presentation helpers for server-built strings (reasons, labels). Pure."""
from __future__ import annotations

_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
WEEKDAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]


def digits(s: str | int | float) -> str:
    return str(s).translate(_FA)


def number(n: int) -> str:
    """3850000 → ۳٬۸۵۰٬۰۰۰"""
    return digits(f"{n:,}").replace(",", "٬")


def distance(meters: float) -> str:
    """800 → «۸۰۰ متر», 1240 → «۱٫۲ کیلومتر»"""
    rounded = int(round(meters / 50.0) * 50) or 50
    if rounded < 1000:
        return f"{digits(rounded)} متر"
    km = round(meters / 1000, 1)
    s = f"{km:.1f}".rstrip("0").rstrip(".")
    return f"{digits(s).replace('.', '٫')} کیلومتر"


def minutes(m: float) -> str:
    m = max(1, int(round(m)))
    if m < 60:
        return f"{digits(m)} دقیقه"
    h, r = divmod(m, 60)
    return f"{digits(h)} ساعت" + (f" و {digits(r)} دقیقه" if r else "")


def price_short(toman: int) -> str:
    """For reasons: 3700000 → «۳٫۷ میلیون»"""
    if toman >= 1_000_000:
        v = f"{toman / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{digits(v).replace('.', '٫')} میلیون"
    if toman >= 1000:
        return f"{digits(toman // 1000)} هزار"
    return digits(toman)
