"""The only door to the LLM provider (ARCHITECTURE §11.1, CLAUDE.md budget rules).

- One OpenAI-compatible client pointed at LLM_BASE_URL; gpt-5.4-mini by default.
- Every call caps `max_completion_tokens`, logs model/latency/tokens, and counts tokens per Tehran day in app.db.
  Over LLM_MAX_TOKENS_PER_DAY (or with the LLM disabled/unconfigured) callers get `LLMUnavailable` and use their
  non-LLM fallback.
- `cached()` memoises results that don't depend on the user (need-finder per category, compare verdicts, …)."""
from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime

from app.appdb import app_db
from app.config import get_settings
from app.hours import TEHRAN

log = logging.getLogger("bebin.llm")
TIMEOUT_ASSISTANT = 20.0
TIMEOUT_FAST = 8.0


class LLMUnavailable(Exception):
    """Raised instead of calling the provider; the caller must fall back."""


def _ensure_tables() -> None:
    con = app_db()
    con.execute("CREATE TABLE IF NOT EXISTS llm_usage(day TEXT PRIMARY KEY, tokens INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0)")
    con.execute("CREATE TABLE IF NOT EXISTS llm_cache(key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL)")


def _day() -> str:
    return datetime.now(TEHRAN).strftime("%Y-%m-%d")


def used_today() -> int:
    _ensure_tables()
    r = app_db().execute("SELECT tokens FROM llm_usage WHERE day=?", (_day(),)).fetchone()
    return r["tokens"] if r else 0


def available() -> bool:
    s = get_settings()
    return s.llm_configured and used_today() < s.llm_max_tokens_per_day


def check() -> None:
    if not available():
        raise LLMUnavailable("disabled, unconfigured or over today's budget")


def record(model: str, usage, started: float, kind: str) -> None:
    tokens = 0
    if usage is not None:
        tokens = int(getattr(usage, "total_tokens", 0) or 0) or int(
            (getattr(usage, "prompt_tokens", 0) or 0) + (getattr(usage, "completion_tokens", 0) or 0))
    _ensure_tables()
    app_db().execute("INSERT INTO llm_usage(day, tokens, calls) VALUES (?,?,1) ON CONFLICT(day) DO UPDATE SET "
                     "tokens=tokens+excluded.tokens, calls=calls+1", (_day(), tokens))
    log.info("llm %s model=%s tokens=%s latency_ms=%d", kind, model, tokens, int((time.time() - started) * 1000))


_async_client = None
_sync_client = None


def async_client():
    global _async_client
    if _async_client is None:
        from openai import AsyncOpenAI
        s = get_settings()
        _async_client = AsyncOpenAI(base_url=s.llm_base_url, api_key=s.llm_api_key, max_retries=1)
    return _async_client


def sync_client():
    global _sync_client
    if _sync_client is None:
        from openai import OpenAI
        s = get_settings()
        _sync_client = OpenAI(base_url=s.llm_base_url, api_key=s.llm_api_key, max_retries=1)
    return _sync_client


def fast_model() -> str:
    return get_settings().llm_model_fast or "gpt-5.4-mini"


def assistant_model() -> str:
    return get_settings().llm_model_assistant or "gpt-5.4-mini"


def chat_json_sync(system: str, user: str, max_tokens: int = 300, timeout: float = TIMEOUT_FAST) -> dict:
    """Small structured call (fast model, JSON mode). Raises LLMUnavailable on any failure."""
    check()
    started = time.time()
    try:
        r = sync_client().chat.completions.create(
            model=fast_model(), messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"}, max_completion_tokens=max_tokens, timeout=timeout)
    except Exception as e:  # network, provider, timeout: all mean "use the fallback"
        log.warning("llm json failed: %s", type(e).__name__)
        raise LLMUnavailable(str(e)) from e
    record(fast_model(), r.usage, started, "json")
    try:
        return json.loads(r.choices[0].message.content or "{}")
    except ValueError as e:
        raise LLMUnavailable("bad json") from e


def cached(namespace: str, key_parts, compute):
    """Return the cached value for (namespace, key) or compute, store and return it. Failures aren't cached."""
    _ensure_tables()
    key = namespace + ":" + hashlib.sha256(json.dumps(key_parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
    r = app_db().execute("SELECT value FROM llm_cache WHERE key=?", (key,)).fetchone()
    if r:
        return json.loads(r["value"])
    value = compute()
    app_db().execute("INSERT OR REPLACE INTO llm_cache(key, value, created_at) VALUES (?,?,?)",
                     (key, json.dumps(value, ensure_ascii=False), datetime.now(TEHRAN).isoformat()))
    return value


_pending: set[str] = set()


def cached_or_background(namespace: str, key_parts, compute):
    """Non-blocking cache read for hot paths (search): returns the cached value, or None while a background
    thread computes it for next time. Failures are simply not cached."""
    import threading
    _ensure_tables()
    key = namespace + ":" + hashlib.sha256(json.dumps(key_parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
    r = app_db().execute("SELECT value FROM llm_cache WHERE key=?", (key,)).fetchone()
    if r:
        return json.loads(r["value"])
    if key in _pending or not available():
        return None
    _pending.add(key)

    def work():
        try:
            value = compute()
            app_db().execute("INSERT OR REPLACE INTO llm_cache(key, value, created_at) VALUES (?,?,?)",
                             (key, json.dumps(value, ensure_ascii=False), datetime.now(TEHRAN).isoformat()))
        except Exception as e:
            log.info("background %s failed: %s", namespace, type(e).__name__)
        finally:
            _pending.discard(key)
    threading.Thread(target=work, daemon=True).start()
    return None
