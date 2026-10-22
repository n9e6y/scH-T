"""Parsers for raw dataset fields (used by data/build_catalog.py). Pure, no I/O.

Tri-state rule: never coerce unknown to False. Return None when the data says nothing.
"""
from __future__ import annotations

import json
import re

from app.text import normalize_fa, to_latin_digits

# ---------------------------------------------------------------- location
_MALL_RE = re.compile(r"(پاساژ|مجتمع\s*تجاری|مجتمع|مرکز\s*خرید|بازار|سرای|ساختمان|برج)\s*([^،,\-–]{1,40})")
_FLOOR_RE = re.compile(r"طبقه\s*([^،,\-–]{0,15})")
_UNIT_RE = re.compile(r"واحد\s*([0-9۰-۹A-Za-z/\-]+)")

_ORDINALS = {"اول": 1, "یکم": 1, "دوم": 2, "سوم": 3, "چهارم": 4, "پنجم": 5, "ششم": 6,
             "هفتم": 7, "هشتم": 8, "نهم": 9, "دهم": 10, "یک": 1, "دو": 2, "سه": 3, "چهار": 4,
             "پنج": 5, "شش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10}
_FA_ORD_LABEL = {1: "اول", 2: "دوم", 3: "سوم", 4: "چهارم", 5: "پنجم", 6: "ششم", 7: "هفتم",
                 8: "هشتم", 9: "نهم", 10: "دهم"}


def parse_floor(text: str) -> tuple[str | None, int | None]:
    """'همکف' → ('همکف', 0); 'منفی ۱' → ('زیرزمین', -1); '۲' → ('طبقه ۲', 2)."""
    t = normalize_fa(text).replace("طبقه", "").strip()
    if not t:
        return None, None
    if t.startswith("بالای همکف"):
        return "بالای همکف", 0
    if t.startswith(("زیر همکف", "زیرهمکف", "زیرزمین", "زیر زمین", "زیرین")):
        return "زیرزمین", -1
    if t.startswith("همکف"):
        return "همکف", 0
    neg = t.startswith("منفی")
    t2 = t.replace("منفی", "").strip()
    m = re.match(r"(\d+)", t2)
    n = int(m.group(1)) if m else None
    if n is None:
        for word, val in _ORDINALS.items():
            if t2.startswith(word):
                n = val
                break
    if n is None:
        return None, None
    if neg:
        return ("زیرزمین" if n == 1 else f"زیرزمین {n}"), -n
    if n > 60:  # an address number, not a floor
        return None, None
    return f"طبقه {n}", n


def parse_location(address: str) -> dict:
    """Extract mall name, floor and unit from a free-text address."""
    out: dict = {"mall_name": None, "floor_label": None, "floor_order": None, "unit": None}
    if not address:
        return out
    m = _MALL_RE.search(address)
    if m and m.group(1) != "ساختمان" or (m and "ساختمان" in m.group(1) and _FLOOR_RE.search(address)):
        kind = re.sub(r"\s+", " ", m.group(1))
        name = m.group(2).strip()
        name = re.split(r"\s+(?:طبقه|واحد|پلاک|روبرو|روبه‌رو|جنب|بین|نبش)\b", name)[0].strip()
        if name:
            out["mall_name"] = f"{kind} {name}"
    f = _FLOOR_RE.search(address)
    if f:
        out["floor_label"], out["floor_order"] = parse_floor(f.group(1))
    u = _UNIT_RE.search(address)
    if u:
        out["unit"] = to_latin_digits(u.group(1)).strip("-/")
    return out


def mall_key(name: str) -> str:
    """Loose key to merge spelling variants: علاالدین / علاءالدین / علائدین."""
    t = normalize_fa(name)
    t = re.sub(r"^(پاساژ|مجتمع تجاری|مجتمع|مرکز خرید|بازار|سرای|ساختمان|برج)\s*", "", t)
    t = re.sub(r"[ءئای\s‌]", "", t)
    t = re.sub(r"(.)\1+", r"\1", t)
    return t


# ---------------------------------------------------------------- payment
INSTALLMENT_PROVIDERS = {"اسنپ‌پی", "دیجی پی", "تارا", "ازکی‌وام"}


def parse_payment(raw: str | None) -> dict:
    """Payment options → tri-state flags. Absence is unknown (NULL), never False:
    almost every shop has an empty list, so an empty list proves nothing."""
    out = {"torob_pay": None, "installments": None, "installment_types": None, "kala_barg": None}
    try:
        items = json.loads(raw) if raw and raw != "null" else []
    except ValueError:
        items = []
    providers = [i.get("provider_name", "") for i in items if isinstance(i, dict)]
    if any(normalize_fa(p) == normalize_fa("ترب‌پی") for p in providers):
        out["torob_pay"] = 1
    inst = [p for p in providers if p in INSTALLMENT_PROVIDERS]
    if inst:
        out["installments"] = 1
        out["installment_types"] = json.dumps(sorted(set(inst)), ensure_ascii=False)
    if any("کالابرگ" in p for p in providers):
        out["kala_barg"] = 1
    return out


def parse_tristate(raw: str | None) -> int | None:
    if raw in ("true", "True", "1"):
        return 1
    if raw in ("false", "False", "0"):
        return 0
    return None


# ---------------------------------------------------------------- warranty
_WORD_NUM = {"یک": 1, "یکسال": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "هجده": 18,
             "هیجده": 18, "دوازده": 12, "بیست و چهار": 24}


def parse_warranty(raw: str | None) -> dict:
    out = {"warranty_raw": None, "warranty_provider": None, "warranty_months": None}
    if not raw or raw == "null":
        return out
    try:
        w = json.loads(raw)
    except ValueError:
        return {**out, "warranty_raw": raw}
    desc = (w.get("description") or "").strip()
    out["warranty_raw"] = desc or None
    out["warranty_provider"] = w.get("provider") or None
    months = w.get("period_months")
    if not months and desc:
        months = months_from_text(desc)
    out["warranty_months"] = int(months) if months else None
    return out


def months_from_text(text: str) -> int | None:
    t = normalize_fa(text)
    m = re.search(r"(\d+)\s*ماه", t)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*سال", t)
    if m:
        return int(m.group(1)) * 12
    if re.search(r"یک\s*سال|یکسال", t):
        return 12
    for word, n in sorted(_WORD_NUM.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"{word}\s*ساله?", t):
            return n * 12
        if re.search(rf"{word}\s*ماه", t):
            return n
    return None


# ---------------------------------------------------------------- specs
_EMPTY_VALUES = {"", "-", "نامشخص", "نامشحص", "ندارد؟", "null", "none"}


def parse_specs(raw: str | None) -> dict[str, str]:
    """[{key, section, value}] → ordered {key: value}, first value wins, empties dropped."""
    if not raw or raw in ("null", "[]"):
        return {}
    try:
        items = json.loads(raw)
    except ValueError:
        return {}
    out: dict[str, str] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        k = re.sub(r"\s+", " ", str(it.get("key") or "")).strip()
        v = re.sub(r"\s+", " ", str(it.get("value") or "")).strip()
        if not k or normalize_fa(v) in _EMPTY_VALUES or k in out:
            continue
        out[k] = v
    return out
