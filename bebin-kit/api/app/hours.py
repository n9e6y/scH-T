"""Weekly hours parsing and open status (ARCHITECTURE §5). Pure, no I/O.

Weekday index: 0=Saturday … 6=Friday. Minutes from local midnight; close may exceed 1440
when a shift runs past midnight.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")
DAY_KEYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]
CLOSING_SOON_MIN = 60

Range = tuple[int, int]  # (open_min, close_min)


def _to_min(hms: str) -> int:
    h, m, *_ = hms.split(":")
    return int(h) * 60 + int(m)


def parse_weekly_hours(raw: str | None) -> dict[int, list[Range]] | None:
    """Raw `weekly_hours` JSON → {weekday: [ranges]}. Returns None when hours are unknown.

    A day with status `closed` maps to []. A day with status `unsupported` makes the
    whole week unknown for that day (key absent). `00:00–00:00` shifts are empty
    placeholders; `00:00` as an end time means midnight.
    """
    if not raw or raw in ("null", "{}"):
        return None
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not data:
        return None
    week: dict[int, list[Range]] = {}
    for idx, key in enumerate(DAY_KEYS):
        day = data.get(key)
        if not day:
            continue
        status = day.get("status")
        if status == "closed":
            week[idx] = []
            continue
        if status != "declared":
            continue
        ranges: list[Range] = []
        suspect = False
        for s in day.get("shifts") or []:
            start, end = _to_min(s["start_time"]), _to_min(s["end_time"])
            if start == 0 and end == 0:
                continue
            if start == 0 and end < 23 * 60:
                # «00:00–21:00» is a missing start time, not a shop open since midnight.
                suspect = True
                continue
            if end <= start:
                end += 1440
            ranges.append((start, end))
        if not ranges and suspect:
            continue  # unknown for this day, not closed
        week[idx] = sorted(ranges)
    return week or None


def weekday_index(dt: datetime) -> int:
    """Python weekday (Mon=0) → our index (Sat=0)."""
    return (dt.weekday() + 2) % 7


def fmt_hm(minutes: int) -> str:
    minutes %= 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@dataclass
class OpenStatus:
    state: str  # open | closing_soon | closed | unknown
    closes_at: str | None = None
    opens_at: dict | None = None  # {weekday, time, days_ahead}
    today_ranges: list[str] | None = None

    def as_dict(self) -> dict:
        return {"state": self.state, "closes_at": self.closes_at, "opens_at": self.opens_at,
                "today_ranges": self.today_ranges}


def open_status(week: dict[int, list[Range]] | None, at: datetime) -> OpenStatus:
    if not week:
        return OpenStatus("unknown")
    at = at.astimezone(TEHRAN)
    wd = weekday_index(at)
    now_min = at.hour * 60 + at.minute
    today = week.get(wd)
    today_ranges = None if today is None else [f"{fmt_hm(a)}–{fmt_hm(b)}" for a, b in today]

    # Shifts from yesterday that run past midnight.
    candidates: list[Range] = [(a - 1440, b - 1440) for a, b in week.get((wd - 1) % 7, []) if b > 1440]
    candidates += today or []
    for a, b in candidates:
        if a <= now_min < b:
            state = "closing_soon" if b - now_min <= CLOSING_SOON_MIN else "open"
            return OpenStatus(state, closes_at=fmt_hm(b), today_ranges=today_ranges)

    if today is None and not candidates:
        # Today's hours are not known; we can't say it's closed.
        return OpenStatus("unknown", today_ranges=None)

    nxt = next_opening(week, wd, now_min)
    return OpenStatus("closed", opens_at=nxt, today_ranges=today_ranges)


def next_opening(week: dict[int, list[Range]], wd: int, now_min: int) -> dict | None:
    for ahead in range(0, 8):
        day = (wd + ahead) % 7
        for a, _ in week.get(day, []):
            if ahead == 0 and a <= now_min:
                continue
            return {"weekday": day, "time": fmt_hm(a), "days_ahead": ahead}
    return None


def open_at(week: dict[int, list[Range]] | None, at: datetime) -> OpenStatus:
    """Open status at an arbitrary moment (e.g. estimated arrival)."""
    return open_status(week, at)


def add_minutes(dt: datetime, minutes: float) -> datetime:
    return dt + timedelta(minutes=minutes)
