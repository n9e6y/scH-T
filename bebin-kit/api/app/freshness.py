"""Price freshness relative to the dataset snapshot (ARCHITECTURE §6). Pure."""
from __future__ import annotations

from datetime import datetime

FRESH_DAYS = 3
AGING_DAYS = 14


def tier(changed_at: str | None, snapshot: datetime) -> str:
    if not changed_at:
        return "unknown"
    try:
        changed = datetime.fromisoformat(changed_at)
    except ValueError:
        return "unknown"
    age = (snapshot - changed).total_seconds() / 86400
    if age <= FRESH_DAYS:
        return "fresh"
    if age <= AGING_DAYS:
        return "aging"
    return "stale"


RANK = {"fresh": 3, "aging": 2, "stale": 1, "unknown": 0}
