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


JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    """Gregorian → Jalali (standard arithmetic algorithm)."""
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + days // 31, 1 + days % 31
    else:
        jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
    return jy, jm, jd


def jalali(iso: str | None) -> str | None:
    """'2026-10-19T…' (Tehran date) → «۲۷ مهر»."""
    if not iso:
        return None
    from datetime import datetime, timedelta, timezone
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo:
        dt = dt.astimezone(timezone(timedelta(hours=3, minutes=30)))
    _, m, d = to_jalali(dt.year, dt.month, dt.day)
    return f"{digits(d)} {JALALI_MONTHS[m - 1]}"
