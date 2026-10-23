"""Optional vector index (ARCHITECTURE §4, §9): EMBEDDINGS_PROVIDER=api plus api/data/vectors/ (built by
data/build_embeddings.py) turn on hybrid search and vector neighbours for similar products.

Every entry point returns None when anything is missing (flag off, files absent, provider down or over budget),
so callers keep their FTS-only path. Query vectors go through llm.py and are cached in app.db, so a repeated
query costs no tokens."""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass

import numpy as np

from app import llm
from app.config import get_settings
from app.db import catalog

log = logging.getLogger("bebin.embeddings")
RRF_K = 60
CHUNK = 16384  # float16 rows are upcast per chunk: ~12 ms for 226k×256 and no float32 copy of the matrix
QUERY_TIMEOUT = 2.5  # the provider answers in ~1.1–1.4 s; past this, FTS alone is the better experience


@dataclass
class Index:
    mat: np.ndarray  # N×d float16, rows L2-normalised
    rids: np.ndarray  # N int64, catalog rowids (-1: product no longer in the catalog)
    row_of: dict[int, int]
    info: dict


_lock = threading.Lock()
_index: Index | None = None
_loaded = False


FILES = ("products_f16.npy", "product_ids.npy", "info.json")


def _fetch_remote(d) -> None:
    """Download missing vector files from the private bucket (S3_* settings) into `d`."""
    s = get_settings()
    if not (s.s3_endpoint and s.s3_bucket and s.s3_access_key) or all((d / f).exists() for f in FILES):
        return
    import boto3  # only in the Docker image; local dev reads api/data/vectors directly
    s3 = boto3.client("s3", endpoint_url=s.s3_endpoint, aws_access_key_id=s.s3_access_key,
                      aws_secret_access_key=s.s3_secret_key)
    d.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        if not (d / f).exists():
            log.info("downloading vectors/%s", f)
            s3.download_file(s.s3_bucket, f"vectors/{f}", str(d / f"{f}.part"))
            (d / f"{f}.part").rename(d / f)


def index() -> Index | None:
    """The loaded index, or None. Never blocks a request: while the startup thread downloads or loads the
    files, callers get None and stay on FTS."""
    global _index, _loaded
    if _loaded:
        return _index
    if not _lock.acquire(blocking=False):
        return None
    try:
        if _loaded:
            return _index
        s = get_settings()
        d = s.path(s.vectors_dir)
        if s.embeddings_provider == "api":
            try:
                _fetch_remote(d)
            except Exception as e:
                log.warning("vectors not downloaded: %s", e)
        if s.embeddings_provider == "api" and (d / "products_f16.npy").exists():
            try:
                mat = np.load(d / "products_f16.npy")
                pids = np.load(d / "product_ids.npy")
                rid_of = {r[0]: r[1] for r in catalog().execute("SELECT product_id, rid FROM products")}
                rids = np.array([rid_of.get(str(p), -1) for p in pids], dtype=np.int64)
                info = json.loads((d / "info.json").read_text()) if (d / "info.json").exists() else {}
                _index = Index(mat, rids, {int(r): i for i, r in enumerate(rids) if r >= 0}, info)
                log.info("vectors loaded: %d×%d (%d unmatched)", *mat.shape, int((rids < 0).sum()))
            except Exception as e:  # a broken index must not take search down
                log.warning("vectors not loaded: %s", e)
        _loaded = True  # a failed download is retried on the next restart, not per request
        return _index
    finally:
        _lock.release()


def reset() -> None:
    """Tests: forget the loaded index so the next call re-reads settings and files."""
    global _index, _loaded
    _index, _loaded = None, False


def available() -> bool:
    return index() is not None


def query_vector(text: str) -> np.ndarray | None:
    if not text.strip() or index() is None:
        return None
    try:
        vec = llm.cached("qvec", [get_settings().embeddings_model, text],
                         lambda: [round(x, 5) for x in llm.embed([text], timeout=QUERY_TIMEOUT)[0][0]])
    except llm.LLMUnavailable:
        return None
    v = np.asarray(vec, dtype=np.float32)
    return v / max(float(np.linalg.norm(v)), 1e-9)


def _scores(v: np.ndarray, rows: np.ndarray | None = None) -> np.ndarray:
    m = index().mat if rows is None else index().mat[rows]
    return np.concatenate([m[i:i + CHUNK].astype(np.float32) @ v for i in range(0, len(m), CHUNK)])


def search(text: str, k: int) -> list[int] | None:
    """Catalog rids of the k products closest to the query text, best first."""
    v = query_vector(text)
    if v is None:
        return None
    idx = index()
    sc = _scores(v)
    sc[idx.rids < 0] = -2.0
    top = np.argpartition(-sc, min(k, len(sc) - 1))[:k]
    return [int(idx.rids[i]) for i in top[np.argsort(-sc[top])] if idx.rids[i] >= 0]


def similarity(rid: int, others: list[int]) -> dict[int, float] | None:
    """Cosine between product `rid` and each of `others` (only those in the index)."""
    idx = index()
    if idx is None or rid not in idx.row_of:
        return None
    rows = [(o, idx.row_of[o]) for o in others if o in idx.row_of]
    if not rows:
        return {}
    sc = _scores(idx.mat[idx.row_of[rid]].astype(np.float32), np.array([r for _, r in rows]))
    return {o: float(s) for (o, _), s in zip(rows, sc)}


def fuse(fts: dict[int, float], vec: list[int], k: int = RRF_K) -> dict[int, float]:
    """Reciprocal rank fusion of FTS (rid → bm25, more negative = better) and vector ranks, mapped back onto
    the FTS score range so the ranking boosts in search.relevance keep their weight."""
    rrf: dict[int, float] = {}
    for rank, rid in enumerate(sorted(fts, key=fts.get)):
        rrf[rid] = 1 / (k + rank)
    for rank, rid in enumerate(vec):
        rrf[rid] = rrf.get(rid, 0.0) + 1 / (k + rank)
    if not rrf:
        return {}
    best, worst = (min(fts.values()), max(fts.values())) if fts else (-10.0, -5.0)
    if worst - best < 1.0:
        worst = best + 1.0
    hi, lo = max(rrf.values()), min(rrf.values())
    span = (hi - lo) or 1.0
    return {rid: worst - (r - lo) / span * (worst - best) for rid, r in rrf.items()}
