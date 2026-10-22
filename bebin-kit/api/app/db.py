"""SQLite connections. The catalog is opened once, read-only and immutable."""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from app.config import get_settings

_local = threading.local()
_catalog_path: Path | None = None


def set_catalog_path(path: Path) -> None:
    """Used by tests to point at the fixture DB."""
    global _catalog_path
    _catalog_path = path
    _local.__dict__.clear()


def catalog() -> sqlite3.Connection:
    con = getattr(_local, "catalog", None)
    if con is None:
        path = _catalog_path or get_settings().path(get_settings().catalog_db_path)
        if not path.exists():
            raise RuntimeError(f"catalog.db not found at {path}; run `make data`")
        con = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True, check_same_thread=False)
        con.row_factory = sqlite3.Row
        _local.catalog = con
    return con


_meta_cache: dict | None = None


def meta() -> dict:
    global _meta_cache
    if _meta_cache is None or _catalog_path is not None:
        _meta_cache = {r["key"]: r["value"] for r in catalog().execute("SELECT key, value FROM meta")}
    return _meta_cache
