"""`make eval` (ARCHITECTURE §11.5). Opt-in: part 1 is offline (query parsing accuracy on the real catalog);
part 2 calls the real LLM through the assistant only with `--live` (a few thousand tokens per scenario).
Usage: uv run python eval/run_eval.py [--live]"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import search  # noqa: E402
from app.hours import TEHRAN  # noqa: E402
from app.query import parse_query  # noqa: E402

HERE = Path(__file__).parent


def parsing() -> float:
    cases = json.loads((HERE / "queries.json").read_text(encoding="utf-8"))
    brands, areas = search.brand_dict(), [a["name_fa"] for a in search.areas()]
    ok = 0
    for c in cases:
        f = parse_query(c["q"], brands, areas).filters
        got = {k: (sorted(v) if isinstance(v, list) else v) for k, v in f.items()}
        want = {k: (sorted(v) if isinstance(v, list) else v) for k, v in c["expect"].items()}
        hit = all(got.get(k) == v for k, v in want.items())
        ok += hit
        if not hit:
            print(f"  ✗ {c['q']}\n      want {want}\n      got  {got}")
    acc = ok / len(cases)
    print(f"query parsing: {ok}/{len(cases)} = {acc:.0%}")
    return acc


SCENARIOS = [
    "یه اسپیکر جی بی ال اقساطی نزدیک فردوسی می‌خوام",
    "گوشی سامسونگ زیر ۶۰ میلیون، موجوده؟",
    "شارژر سامسونگ ۲۵ وات کجا بخرم؟",
    "کدوم فروشنده الان بازه برای پاور بانک؟",
    "از دو تا فروشنده‌ی نزدیک بپرس قیمت گوشی سامسونگ A17 چنده",
]
STOCK_CLAIMS = ("موجود است", "موجوده", "داریم", "موجود هست", "آره، هست", "بله، هست", "آره هست")


async def assistant_live() -> None:
    from app.assistant.agent import run
    from app.models import ChatIn
    at = datetime(2026, 10, 21, 17, 40, tzinfo=TEHRAN)
    for q in SCENARIOS:
        body = ChatIn(messages=[{"role": "user", "content": q}],
                      context={"location_name": "فردوسی", "lat": 35.6921, "lng": 51.4225})
        text, blocks = "", []
        async for ev in run(body, at, "eval"):
            if ev["type"] == "text_delta":
                text += ev["text"]
            elif ev["type"] == "block":
                blocks.append(ev["block"]["type"])
        claims = [w for w in STOCK_CLAIMS if w in text]
        print(f"{'✓' if blocks and not claims else '✗'} {q}\n    blocks={blocks} stock_claims={claims}\n    {text[:160]}")


if __name__ == "__main__":
    parsing()
    if "--live" in sys.argv:
        only = [a for a in sys.argv[1:] if not a.startswith("--")]
        if only:
            SCENARIOS[:] = only
        asyncio.run(assistant_live())
