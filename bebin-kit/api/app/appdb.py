"""app.db: the writable store (ARCHITECTURE §3): inquiries, their events, verifications, seller presence,
demo overrides. WAL mode, one connection per thread, created on first use."""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS inquiries(
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, shop_id TEXT NOT NULL, product_id TEXT, offer_id TEXT,
  questions TEXT NOT NULL, detail TEXT, hold_until TEXT, note TEXT, status TEXT NOT NULL, channel TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deadline_at TEXT, delivered_at TEXT, seen_at TEXT,
  answered_at TEXT, answer TEXT, read_at TEXT, offset_s REAL NOT NULL DEFAULT 0, plan TEXT, nudged INTEGER DEFAULT 0,
  ctx_at TEXT, tier TEXT DEFAULT 'listed', buyer_distance_m REAL);
CREATE INDEX IF NOT EXISTS inq_session ON inquiries(session_id, created_at);
CREATE INDEX IF NOT EXISTS inq_shop ON inquiries(shop_id, created_at);
CREATE TABLE IF NOT EXISTS inquiry_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id TEXT NOT NULL, session_id TEXT NOT NULL, shop_id TEXT NOT NULL,
  type TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ev_session ON inquiry_events(session_id, id);
CREATE INDEX IF NOT EXISTS ev_shop ON inquiry_events(shop_id, id);
CREATE TABLE IF NOT EXISTS verifications(
  shop_id TEXT NOT NULL, product_id TEXT NOT NULL DEFAULT '', field TEXT NOT NULL, value TEXT, detail TEXT,
  verified_at TEXT NOT NULL, inquiry_id TEXT, PRIMARY KEY(shop_id, product_id, field));
CREATE TABLE IF NOT EXISTS seller_presence(shop_id TEXT PRIMARY KEY, last_seen_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS demo_overrides(shop_id TEXT PRIMARY KEY, next_outcome TEXT);
CREATE TABLE IF NOT EXISTS demo_settings(key TEXT PRIMARY KEY, value TEXT);
"""

_local = threading.local()
_path: Path | None = None
_lock = threading.Lock()


def set_app_db_path(path: Path) -> None:
    """Tests point this at a temp file."""
    global _path
    _path = path
    _local.__dict__.clear()


def app_db() -> sqlite3.Connection:
    con = getattr(_local, "con", None)
    if con is None:
        path = _path or get_settings().path(get_settings().app_db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(path, check_same_thread=False, isolation_level=None, timeout=5)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        with _lock:
            con.executescript(SCHEMA)
        _local.con = con
    return con
