"""The single source of "now" (ARCHITECTURE §5). Honors the demo clock override."""
from __future__ import annotations

from datetime import datetime

from fastapi import Request

from app.hours import TEHRAN


def parse_clock(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt.replace(tzinfo=TEHRAN) if dt.tzinfo is None else dt.astimezone(TEHRAN)


def now(request: Request | None = None) -> datetime:
    if request is not None:
        override = parse_clock(request.headers.get("x-demo-clock"))
        if override:
            return override
    return datetime.now(TEHRAN)
