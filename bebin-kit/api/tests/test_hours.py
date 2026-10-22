import json
from datetime import datetime

from app.hours import TEHRAN, open_status, parse_weekly_hours, weekday_index


def _raw(days: dict) -> str:
    out = {}
    for k in ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]:
        v = days.get(k)
        if v == "closed":
            out[k] = {"shifts": [{"start_time": "00:00:00", "end_time": "00:00:00"}], "status": "closed"}
        elif v == "unsupported":
            out[k] = {"shifts": [], "status": "unsupported"}
        elif v:
            out[k] = {"shifts": [{"start_time": f"{a}:00", "end_time": f"{b}:00"} for a, b in v]
                      + [{"start_time": "00:00:00", "end_time": "00:00:00"}], "status": "declared"}
    return json.dumps(out)


WEEKDAY = {k: [("10:00", "14:00"), ("16:00", "21:00")] for k in ["sat", "sun", "mon", "tue", "wed", "thu"]}
SPLIT = _raw({**WEEKDAY, "fri": "closed"})


def at(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=TEHRAN)


# 2026-10-21 is a Wednesday (چهارشنبه ۲۹ مهر).
def test_weekday_index():
    assert weekday_index(at(2026, 10, 17, 12, 0)) == 0  # Saturday
    assert weekday_index(at(2026, 10, 23, 12, 0)) == 6  # Friday


def test_parse_split_and_closed():
    w = parse_weekly_hours(SPLIT)
    assert w[0] == [(600, 840), (960, 1260)]
    assert w[6] == []


def test_unknown_inputs():
    assert parse_weekly_hours(None) is None
    assert parse_weekly_hours("{}") is None
    assert parse_weekly_hours("null") is None
    assert open_status(None, at(2026, 10, 21, 12, 0)).state == "unknown"


def test_open_and_closing_soon():
    w = parse_weekly_hours(SPLIT)
    s = open_status(w, at(2026, 10, 21, 17, 40))
    assert s.state == "open" and s.closes_at == "21:00"
    assert open_status(w, at(2026, 10, 21, 20, 15)).state == "closing_soon"


def test_split_shift_gap():
    w = parse_weekly_hours(SPLIT)
    s = open_status(w, at(2026, 10, 21, 15, 0))
    assert s.state == "closed" and s.opens_at == {"weekday": 4, "time": "16:00", "days_ahead": 0}


def test_friday_closed_opens_saturday():
    w = parse_weekly_hours(SPLIT)
    s = open_status(w, at(2026, 10, 23, 20, 30))
    assert s.state == "closed"
    assert s.opens_at == {"weekday": 0, "time": "10:00", "days_ahead": 1}


def test_after_midnight():
    w = parse_weekly_hours(_raw({"wed": [("18:00", "02:00")]}))
    assert w[4] == [(1080, 1560)]
    assert open_status(w, at(2026, 10, 21, 23, 0)).state == "open"
    s = open_status(w, at(2026, 10, 22, 1, 30))  # Thursday 01:30, from Wednesday's shift
    assert s.state == "closing_soon" and s.closes_at == "02:00"


def test_midnight_end():
    w = parse_weekly_hours(_raw({"wed": [("10:00", "00:00")]}))
    assert w[4] == [(600, 1440)]


def test_unsupported_day_is_unknown():
    w = parse_weekly_hours(_raw({"sat": [("10:00", "20:00")], "wed": "unsupported"}))
    assert open_status(w, at(2026, 10, 21, 12, 0)).state == "unknown"


def test_midnight_start_is_unknown_day():
    w = parse_weekly_hours(_raw({"sat": [("10:00", "20:00")], "wed": [("00:00", "21:00")]}))
    assert 4 not in w
    assert open_status(w, at(2026, 10, 21, 3, 0)).state == "unknown"


def test_24h():
    w = parse_weekly_hours(_raw({"wed": [("00:00", "23:59")]}))
    assert open_status(w, at(2026, 10, 21, 3, 0)).state == "open"
