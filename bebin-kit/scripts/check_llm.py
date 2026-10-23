"""Probe the OpenAI-compatible LLM provider and write docs/LLM_CAPABILITIES.md (ARCHITECTURE §11.2).

Budget-aware: the provider has no /models endpoint, so candidates come from PROVIDER_MODELS (as the
provider lists them). Each probe uses a tiny prompt; the whole run costs well under one cent on mini models.
Token usage per call is recorded so feature costs can be estimated.

Run: make check-llm            (or: python scripts/check_llm.py gpt-5.4-mini gpt-5-mini)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from openai import OpenAI  # noqa: E402

from app.config import get_settings  # noqa: E402

OUT = ROOT / "docs" / "LLM_CAPABILITIES.md"
# Provider endpoints: /chat/completions and /embeddings only (no /models).
PROVIDER_MODELS = ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna", "gpt-6-sol", "gpt-5-mini", "gpt-5.6-luna",
                   "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.4-mini", "gpt-5.3-codex",
                   "text-embedding-3-small", "text-embedding-3-large"]
DEFAULT_CANDIDATES = ["gpt-5.4-mini", "gpt-5-mini", "gpt-5.6-terra"]
EMBED_MODEL = "text-embedding-3-small"
TOKEN_CAP = 400  # reasoning models spend hidden tokens before answering; keep headroom but bounded


def call(fn):
    t0 = time.perf_counter()
    try:
        out, usage = fn()
        return True, out, usage, int((time.perf_counter() - t0) * 1000)
    except Exception as e:  # noqa: BLE001 - record any provider failure
        return False, f"{type(e).__name__}: {str(e)[:180]}", None, int((time.perf_counter() - t0) * 1000)


def usage_str(u) -> str:
    if not u:
        return ""
    get = (lambda k: u.get(k)) if isinstance(u, dict) else (lambda k: getattr(u, k, None))
    return f"{get('prompt_tokens')}→{get('completion_tokens')}"


def probes(client: OpenAI, model: str, full: bool):
    def chat():
        r = client.chat.completions.create(model=model, max_completion_tokens=TOKEN_CAP,
                                           messages=[{"role": "user", "content": "Reply with exactly: OK"}])
        return r.choices[0].message.content, r.usage

    def stream():
        n, text, usage = 0, "", None
        first = None
        t0 = time.perf_counter()
        for ch in client.chat.completions.create(model=model, stream=True, max_completion_tokens=TOKEN_CAP,
                                                 stream_options={"include_usage": True},
                                                 messages=[{"role": "user", "content": "Count 1 to 5."}]):
            if ch.choices and ch.choices[0].delta.content:
                first = first or time.perf_counter() - t0
                text += ch.choices[0].delta.content
                n += 1
            usage = ch.usage or usage
        return f"{n} chunks, first token {int((first or 0) * 1000)} ms: {text[:30]}", usage

    def tools():
        r = client.chat.completions.create(
            model=model, max_completion_tokens=TOKEN_CAP,
            messages=[{"role": "user", "content": "Find Samsung phones under 60 million toman."}],
            tools=[{"type": "function", "function": {"name": "search_products", "parameters": {
                "type": "object", "properties": {"query": {"type": "string"}, "max_price": {"type": "integer"}},
                "required": ["query"]}}}])
        calls = r.choices[0].message.tool_calls
        assert calls, f"no tool call: {r.choices[0].message.content!r}"
        return calls[0].function.arguments, r.usage

    def json_mode():
        r = client.chat.completions.create(model=model, max_completion_tokens=TOKEN_CAP,
                                           response_format={"type": "json_object"},
                                           messages=[{"role": "user", "content": 'Return JSON {"ok": true}'}])
        return json.loads(r.choices[0].message.content), r.usage

    def persian():
        r = client.chat.completions.create(model=model, max_completion_tokens=TOKEN_CAP, messages=[{
            "role": "user", "content": "مثل یک فروشنده‌ی مؤدب در تهران، در یک جمله بگو سایز ۴۳ موجود است "
                                       "و قیمت امروز ۳ میلیون و ۷۰۰ هزار تومان است."}])
        return r.choices[0].message.content, r.usage

    tests = [("chat", chat), ("tool calling", tools)]
    if full:
        tests += [("streaming", stream), ("JSON mode", json_mode), ("Persian", persian)]
    return tests


def main():
    s = get_settings()
    if not (s.llm_base_url and s.llm_api_key):
        sys.exit("Set LLM_BASE_URL and LLM_API_KEY in .env first.")
    client = OpenAI(base_url=s.llm_base_url, api_key=s.llm_api_key, timeout=60, max_retries=0)
    candidates = sys.argv[1:] or DEFAULT_CANDIDATES
    rows = []
    for i, model in enumerate(candidates):
        # Full battery on the first two (fast-model candidates); chat + tools only on bigger ones.
        for name, fn in probes(client, model, full=i < 2):
            ok, out, usage, ms = call(fn)
            rows.append((model, name, ok, out, usage_str(usage), ms))
            print(f"{'PASS' if ok else 'FAIL'} {model} · {name} ({ms} ms, tokens {usage_str(usage)}): {str(out)[:100]}")

    def emb(dims):
        kw = {"dimensions": dims} if dims else {}
        r = client.embeddings.create(model=EMBED_MODEL, input=["گوشی سامسونگ A17", "اسپیکر جی بی ال"], **kw)
        return f"dim={len(r.data[0].embedding)}", r.usage

    for name, fn in [("embeddings", lambda: emb(None)), ("embeddings dimensions=256", lambda: emb(256))]:
        ok, out, usage, ms = call(fn)
        u = f"{getattr(usage, 'prompt_tokens', '')} tok" if usage else ""
        rows.append((EMBED_MODEL, name, ok, out, u, ms))
        print(f"{'PASS' if ok else 'FAIL'} {EMBED_MODEL} · {name} ({ms} ms): {out}")

    passed = {(m, n): ok for m, n, ok, *_ in rows}
    working = [m for m in candidates if passed.get((m, "chat")) and passed.get((m, "tool calling"))]
    fast = next((m for m in candidates[:2] if m in working), working[0] if working else "")
    assistant = fast  # budget default; see recommendation text
    emb_ok = passed.get((EMBED_MODEL, "embeddings"), False)
    dims_ok = passed.get((EMBED_MODEL, "embeddings dimensions=256"), False)

    lines = ["# LLM capabilities", "",
             f"Generated by `scripts/check_llm.py` on {time.strftime('%Y-%m-%d %H:%M')}.", "",
             f"Provider: `{s.llm_base_url}` · endpoints: `/chat/completions`, `/embeddings` (no `/models`).", "",
             "Models offered by the provider: " + ", ".join(f"`{m}`" for m in PROVIDER_MODELS), "",
             "| Model | Check | Result | Latency | Tokens in→out | Output |", "|---|---|---|---|---|---|"]
    lines += [f"| {m} | {n} | {'✅' if ok else '❌'} | {ms} ms | {u} | {str(o).replace('|', '/').replace(chr(10), ' ')[:90]} |"
              for m, n, ok, o, u, ms in rows]
    lines += ["", "## Recommendation",
              f"- `LLM_MODEL_FAST={fast}`",
              f"- `LLM_MODEL_ASSISTANT={assistant}` (budget default; switch to a bigger model only for the demo recording)",
              f"- `EMBEDDINGS_PROVIDER={'api' if emb_ok else 'off'}` · `EMBEDDINGS_MODEL={EMBED_MODEL}`"
              f" · dimensions param {'supported' if dims_ok else 'NOT supported (use PCA)'}",
              f"- Assistant mode: {'tool calling' if passed.get((assistant, 'tool calling')) else 'JSON intent router'}"]
    OUT.parent.mkdir(parents=True, exist_ok=True)  # docs/ isn't in git; a fresh clone lacks it
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
