"""Seller wording for simulated replies (ARCHITECTURE §10): the LLM may rephrase the template message so it
sounds like a real shopkeeper, but it never decides facts. Every number in the template must survive into the
rephrased text, otherwise the template is kept. Cached per template, so repeats cost nothing."""
from __future__ import annotations

import re

from app import llm

SYSTEM = ("تو یک فروشنده‌ی مغازه در تهران هستی و جواب کوتاه یک مشتری را در پیام‌رسان می‌نویسی. "
          "متن داده‌شده را محاوره‌ای، مؤدب و طبیعی بازنویسی کن، حداکثر دو جمله. هیچ واقعیت تازه‌ای اضافه نکن، "
          "هیچ عددی را عوض نکن و چیزی را حذف نکن. خروجی JSON: {\"message\": \"...\"}")
_NUM = re.compile(r"[۰-۹0-9][۰-۹0-9٬,:٫.]*")


def _numbers(text: str) -> set[str]:
    return {re.sub(r"[٬,]", "", n) for n in _NUM.findall(text)}


def rephrase(answer: dict) -> str:
    template = answer.get("message") or ""
    if not template or not answer.get("simulated"):
        return template
    try:
        out = llm.cached("seller_wording", template, lambda: llm.chat_json_sync(SYSTEM, template, max_tokens=160))
    except llm.LLMUnavailable:
        return template
    text = str(out.get("message") or "").strip()
    if not text or len(text) > 400 or not _numbers(template) <= _numbers(text):
        return template
    return text
