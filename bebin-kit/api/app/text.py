"""Persian text normalization (ARCHITECTURE §4). Mirrored in web/lib/text.ts with the same cases."""
import re

_CHAR_MAP = str.maketrans({
    "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "ؤ": "و",
    "إ": "ا", "أ": "ا", "آ": "ا", "ٱ": "ا",
    **{chr(0x06F0 + i): str(i) for i in range(10)},  # Persian digits
    **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic digits
    "٬": "", "٫": ".",
})
_DIACRITICS = re.compile(r"[ً-ٰٟـ]")  # harakat, superscript alef, tatweel
_ZERO_WIDTH = re.compile(r"[​-‏‪-‮⁦-⁩﻿]")
_WS = re.compile(r"\s+")


def normalize_fa(text: str | None) -> str:
    """Normalize for search and matching. Display keeps the original string."""
    if not text:
        return ""
    t = text.translate(_CHAR_MAP)
    t = _DIACRITICS.sub("", t)
    t = _ZERO_WIDTH.sub(" ", t)
    t = _WS.sub(" ", t).strip()
    return t.lower()


def to_latin_digits(text: str) -> str:
    return text.translate(str.maketrans({**{chr(0x06F0 + i): str(i) for i in range(10)},
                                         **{chr(0x0660 + i): str(i) for i in range(10)}}))
