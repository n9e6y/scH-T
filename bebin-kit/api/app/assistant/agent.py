"""Assistant agent (ARCHITECTURE §11.3). Streams events:
  text_delta {text} · tool_status {id, label, state: running|done} · block {…} · done {summary, fallback} · error
At most 6 tool steps. If the LLM is off, over budget or fails before saying anything, it falls back to keyword
search (Assistant 21d): the same blocks without AI reasons, plus a wilt notice."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path

from app import fa, llm, search
from app.appdb import app_db
from app.assistant import tools
from app.models import ChatIn, NoticeBlock, ProductListBlock
from app.views import open_status_view

log = logging.getLogger("bebin.assistant")
MAX_STEPS = 6  # hard cap; the prompt aims for 2–3
MAX_TOKENS = 600
SYSTEM = (Path(__file__).parent / "prompts" / "system.fa.md").read_text(encoding="utf-8")
WEEKDAYS = fa.WEEKDAYS_FA


def _ev(type_: str, **data) -> dict:
    return {"type": type_, **data}


def _context_note(body: ChatIn, at: datetime, session_id: str) -> str:
    c = body.context
    from app.hours import weekday_index
    lines = [f"اکنون: {WEEKDAYS[weekday_index(at)]} ساعت {at.strftime('%H:%M')} به وقت تهران."]
    lines.append(f"موقعیت کاربر: نزدیک {c.location_name}." if c.location_name else "موقعیت کاربر مشخص نیست.")
    if c.compare_ids:
        lines.append(f"در سبد مقایسه: {', '.join(c.compare_ids[:3])}")
    if c.plan_shop_ids:
        lines.append(f"فروشگاه‌های برنامه‌ی بازدید: {', '.join(c.plan_shop_ids[:5])}")
    rows = app_db().execute("SELECT shop_id, status, product_id FROM inquiries WHERE session_id=? ORDER BY created_at DESC LIMIT 5",
                            (session_id,)).fetchall()
    if rows:
        lines.append("پیگیری‌های اخیر: " + "؛ ".join(f"{r['shop_id']}={r['status']}" for r in rows))
    return "\n".join(lines)


async def fallback(body: ChatIn, at: datetime, notice: bool = True) -> AsyncIterator[dict]:
    text = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    c = body.context
    out = await asyncio.to_thread(search.search, search.Params(q=text, lat=c.lat, lng=c.lng), at)
    if notice:
        yield _ev("block", block=NoticeBlock(level="wilt", text="دستیار هوشمند در دسترس نیست؛ جست‌وجوی ساده انجام شد.").model_dump())
    items = [i.model_copy(update={"reasons": []}) for i in out.items[:3]]
    if items:
        yield _ev("block", block=ProductListBlock(title=f"نتیجه‌های جست‌وجو برای «{text[:40]}»", items=items, query=text,
                                                  total=out.total, plain=True).model_dump())
    else:
        yield _ev("text_delta", text="با این جست‌وجو چیزی پیدا نکردم؛ کلمه‌ی دیگری امتحان کن.")
    yield _ev("done", summary=", ".join(i.title[:40] for i in items), fallback=True)


async def run(body: ChatIn, at: datetime, session_id: str) -> AsyncIterator[dict]:
    if not llm.available():
        async for e in fallback(body, at):
            yield e
        return
    c = body.context
    ctx = tools.Ctx(at=at, lat=c.lat, lng=c.lng, location_name=c.location_name)
    convo: list[dict] = [{"role": "system", "content": SYSTEM + "\n\n" + _context_note(body, at, session_id)}]
    convo += [{"role": m.role, "content": m.content} for m in body.messages[-12:]]
    said = False
    shown_blocks = 0
    try:
        for step in range(MAX_STEPS):
            started = time.time()
            stream = await llm.async_client().chat.completions.create(
                model=llm.assistant_model(), messages=convo, tools=tools.SCHEMAS, stream=True,
                stream_options={"include_usage": True}, max_completion_tokens=MAX_TOKENS, timeout=llm.TIMEOUT_ASSISTANT)
            text, calls, usage = "", {}, None
            async for chunk in stream:
                if chunk.usage:
                    usage = chunk.usage
                if not chunk.choices:
                    continue
                d = chunk.choices[0].delta
                if d.content:
                    text += d.content
                    said = True
                    yield _ev("text_delta", text=d.content)
                for tc in d.tool_calls or []:
                    cur = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                    if tc.id:
                        cur["id"] = tc.id
                    if tc.function and tc.function.name:
                        cur["name"] += tc.function.name
                    if tc.function and tc.function.arguments:
                        cur["args"] += tc.function.arguments
            llm.record(llm.assistant_model(), usage, started, "assistant")
            if not calls:
                break
            ordered = [calls[i] for i in sorted(calls)]
            convo.append({"role": "assistant", "content": text or None, "tool_calls": [
                {"id": t["id"], "type": "function", "function": {"name": t["name"], "arguments": t["args"] or "{}"}} for t in ordered]})
            terminal = False
            for t in ordered:
                if t["name"] in tools.RUNNING and not (t["name"] == "search_products" and ctx.searches >= 1):
                    yield _ev("tool_status", id=t["id"], label=tools.RUNNING[t["name"]], state="running")
                res = await asyncio.to_thread(tools.run, ctx, t["name"], t["args"])
                if res.done:
                    yield _ev("tool_status", id=t["id"], label=res.done, state="done")
                for b in res.blocks:
                    shown_blocks += 1
                    yield _ev("block", block=b.model_dump(mode="json"))
                convo.append({"role": "tool", "tool_call_id": t["id"], "content": json.dumps(res.for_model, ensure_ascii=False)[:6000]})
                terminal = terminal or t["name"] in tools.TERMINAL
            if terminal:
                break
            if not llm.available():
                break
    except Exception as e:  # provider/network: never break the core flow
        log.warning("assistant failed: %s", type(e).__name__)
        if not said and not shown_blocks:
            async for ev in fallback(body, at):
                yield ev
            return
        yield _ev("block", block=NoticeBlock(level="wilt", text="ادامه‌ی جواب نیامد؛ دوباره بپرس.").model_dump())
    summary = "، ".join(f"{t[:40]} ({pid})" for pid, t in list(ctx.seen_products.items())[:6])
    yield _ev("done", summary=summary, fallback=False)
