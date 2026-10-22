"""Deterministic query understanding (ARCHITECTURE §4, `search.parse_query`). Pure.

Input: raw Persian/English text. Output: remaining search text, filters, and the
"understood" chips the UI shows so the user can see (and remove) what we parsed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app import fa
from app.text import normalize_fa

_NUM = r"(\d+(?:[.,/]\d+)?)"
_UNIT = r"(میلیون|ملیون|م|هزار|تومان|تومن|ت)?"
_WORD_NUMS = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "هفت": 7, "هشت": 8, "نه": 9,
              "ده": 10, "نیم": 0.5}


def _amount(num: str, unit: str | None) -> int:
    v = float(num.replace("/", ".").replace(",", "."))
    if unit in ("میلیون", "ملیون", "م"):
        v *= 1_000_000
    elif unit == "هزار":
        v *= 1_000
    elif v < 1000:  # «زیر ۴» in a price context means millions
        v *= 1_000_000
    return int(v)


def _words_to_digits(t: str) -> str:
    for w, n in _WORD_NUMS.items():
        t = re.sub(rf"(?<!\S){w}(?=\s*(میلیون|هزار))", str(n), t)
    return t


@dataclass
class Chip:
    key: str  # filter key: max, min, pay, open, near, brand, area
    label: str
    value: str | int | None = None


@dataclass
class ParsedQuery:
    text: str
    filters: dict = field(default_factory=dict)
    chips: list[Chip] = field(default_factory=list)


_MAX = re.compile(rf"(?:زیر|کمتر از|ارزانتر از|ارزون تر از|ارزونتر از|حداکثر|تا سقف|تا)\s*{_NUM}\s*{_UNIT}(?:\s*(?:تومان|تومن))?")
_MIN = re.compile(rf"(?:بالای|بیشتر از|بیش از|حداقل|از)\s*{_NUM}\s*{_UNIT}(?:\s*(?:تومان|تومن))?(?!\s*تا)")
_RANGE = re.compile(rf"(?:بین|از)\s*{_NUM}\s*{_UNIT}\s*(?:و|تا)\s*{_NUM}\s*{_UNIT}(?:\s*(?:تومان|تومن))?")
_FLAGS = [
    ("pay", "installments", "اقساطی", re.compile(r"(?:اقساطی|اقساط|قسطی|قسط)")),
    ("pay", "torob_pay", "ترب‌پی", re.compile(r"(?:ترب\s?پی|torob ?pay)")),
    ("pay", "kala_barg", "کالابرگ", re.compile(r"(?:کالابرگ|کالا برگ)")),
    ("open", True, "الان باز", re.compile(r"(?:(?:الان|همین الان)\s*)?(?:باز باشه|باز باشد|بازن|بازه|باز است|باز)(?!\S)")),
    ("near", True, "نزدیک من", re.compile(r"(?:نزدیک من|نزدیکم|نزدیک خودم|اطراف من|دور و بر|همین نزدیکی)")),
]
_FILLER = re.compile(r"(?<!\S)(?:می ?خوام|میخوام|می خواهم|یه|یک|خوب|ارزون|ارزان|برام|لطفا|پیدا کن|کجا|بخرم|خرید|و|با|که|برای)(?!\S)")


def parse_query(raw: str, brands: dict[str, str] | None = None, areas: list[str] | None = None) -> ParsedQuery:
    """`brands` maps normalized brand → display brand. `areas` are preset names."""
    t = _words_to_digits(normalize_fa(raw))
    t = t.replace("تومن", "تومان")
    out = ParsedQuery(text="")

    m = _RANGE.search(t)
    if m:
        lo, hi = _amount(m.group(1), m.group(2) or m.group(4)), _amount(m.group(3), m.group(4))
        out.filters.update(min=lo, max=hi)
        out.chips.append(Chip("min", f"حداقل {fa.price_short(lo)}", lo))
        out.chips.append(Chip("max", f"حداکثر {fa.price_short(hi)}", hi))
        t = t[:m.start()] + " " + t[m.end():]
    else:
        m = _MAX.search(t)
        if m:
            v = _amount(m.group(1), m.group(2))
            out.filters["max"] = v
            out.chips.append(Chip("max", f"حداکثر {fa.price_short(v)}", v))
            t = t[:m.start()] + " " + t[m.end():]
        m = _MIN.search(t)
        if m and (m.group(2) or float(m.group(1).replace("/", ".")) < 1000):
            v = _amount(m.group(1), m.group(2))
            out.filters["min"] = v
            out.chips.append(Chip("min", f"حداقل {fa.price_short(v)}", v))
            t = t[:m.start()] + " " + t[m.end():]

    for key, val, label, rx in _FLAGS:
        m = rx.search(t)
        if m:
            if key == "pay":
                out.filters.setdefault("pay", []).append(val)
            else:
                out.filters[key] = val
            out.chips.append(Chip(key, label, val if key == "pay" else None))
            t = t[:m.start()] + " " + t[m.end():]

    for area in sorted(areas or [], key=len, reverse=True):
        na = normalize_fa(area)
        m = re.search(rf"(?:نزدیک|اطراف|حوالی|در|تو|توی)?\s*{re.escape(na)}(?!\S)", t)
        if m:
            out.filters["area"] = area
            out.chips.append(Chip("area", f"نزدیک {area}", area))
            t = t[:m.start()] + " " + t[m.end():]
            break

    if brands:
        tokens = t.split()
        for n in (2, 1):
            hit = None
            for i in range(len(tokens) - n + 1):
                cand = " ".join(tokens[i:i + n])
                if cand in brands:
                    hit = (i, cand)
                    break
            if hit:
                i, cand = hit
                # The brand stays in the search text: products.brand is empty for 75% of
                # products, so the title match is what finds them. The chip shows we understood it.
                out.filters["brand"] = brands[cand]
                out.chips.append(Chip("brand", brands[cand], brands[cand]))
                break

    t = _FILLER.sub(" ", t)
    out.text = re.sub(r"\s+", " ", t).strip()
    return out
