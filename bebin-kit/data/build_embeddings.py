"""Build api/data/vectors/ from catalog.db (ARCHITECTURE §4, "Embeddings option").

Usage:
  python data/build_embeddings.py              # full build, resumes from vectors/parts/
  python data/build_embeddings.py --limit 2000 # first N products only (a cost/latency probe)

Indexed text: title + brand + model + category. One part file per batch, so a crash or a provider error only
loses the batch in flight; rerunning skips finished parts. When every part exists the parts are merged into
products_f16.npy (rows L2-normalised, float16), product_ids.npy and info.json.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
os.chdir(ROOT / "api")  # settings read ../.env relative to the kit root either way

from app import llm  # noqa: E402
from app.config import get_settings  # noqa: E402

CATALOG = ROOT / "api" / "data" / "catalog.db"
OUT = ROOT / "api" / "data" / "vectors"
BATCH = 256
WORKERS = 4
RETRIES = 4


def doc_text(r: sqlite3.Row) -> str:
    parts = [r["title_fa"][:160]]
    if r["brand"]:
        parts.append(r["brand"])
    # Some models are slugs («authentic-base-10793»); they add noise, not meaning.
    if r["model"] and "-" not in r["model"]:
        parts.append(r["model"])
    if r["category"]:
        parts.append(r["category"])
    return " | ".join(parts)


def embed_batch(texts: list[str]) -> tuple[np.ndarray, int]:
    for attempt in range(RETRIES):
        try:
            vecs, tokens = llm.embed(texts, timeout=60.0, offline=True)
            return np.asarray(vecs, dtype=np.float32), tokens
        except llm.LLMUnavailable as e:
            if attempt == RETRIES - 1:
                raise
            wait = 2 ** attempt * 3
            logging.warning("batch failed (%s); retrying in %ss", str(e)[:80], wait)
            time.sleep(wait)
    raise AssertionError("unreachable")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    logging.getLogger("bebin.llm").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    s = get_settings()

    con = sqlite3.connect(f"file:{CATALOG}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT product_id, title_fa, brand, model, category FROM products ORDER BY rid").fetchall()
    if args.limit:
        rows = rows[:args.limit]
    parts_dir = OUT / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    starts = list(range(0, len(rows), BATCH))
    todo = [st for st in starts if not (parts_dir / f"{st:07d}.npy").exists()]
    logging.info("%d products, %d batches, %d to do (model=%s dim=%d)", len(rows), len(starts), len(todo),
                 s.embeddings_model, s.embeddings_dim)

    tokens_total, done, t0 = 0, 0, time.time()

    def work(st: int) -> int:
        vecs, tokens = embed_batch([doc_text(r) for r in rows[st:st + BATCH]])
        tmp = parts_dir / f"{st:07d}.tmp.npy"
        np.save(tmp, vecs.astype(np.float16))
        tmp.rename(parts_dir / f"{st:07d}.npy")
        return tokens

    with ThreadPoolExecutor(WORKERS) as pool:
        futs = {pool.submit(work, st): st for st in todo}
        for f in as_completed(futs):
            tokens_total += f.result()
            done += 1
            if done % 20 == 0 or done == len(todo):
                rate = done / max(1e-6, time.time() - t0)
                logging.info("%d/%d batches, %d tokens so far, ~%ds left", done, len(todo), tokens_total,
                             int((len(todo) - done) / max(rate, 1e-6)))

    mat = np.concatenate([np.load(parts_dir / f"{st:07d}.npy").astype(np.float32) for st in starts])
    mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
    np.save(OUT / "products_f16.npy", mat.astype(np.float16))
    np.save(OUT / "product_ids.npy", np.array([r["product_id"] for r in rows]))
    info = {"provider": "api", "model": s.embeddings_model, "dim": int(mat.shape[1]), "count": int(mat.shape[0]),
            "pca": False, "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "tokens_this_run": tokens_total,
            "text": "title | brand | model | category"}
    (OUT / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=1))
    logging.info("wrote %s (%d×%d), %d tokens this run", OUT, *mat.shape, tokens_total)


if __name__ == "__main__":
    main()
