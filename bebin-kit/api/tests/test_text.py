import json
from pathlib import Path

import pytest

from app.text import normalize_fa

CASES = json.loads((Path(__file__).parent / "text_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("raw,expected", CASES)
def test_normalize_fa(raw, expected):
    assert normalize_fa(raw) == expected


def test_none():
    assert normalize_fa(None) == ""
