"""Hybrid search with a fake vector index: no provider calls, fixture catalog only."""
import numpy as np
import pytest

from app import db, embeddings


def test_fuse_keeps_fts_range_and_rewards_agreement():
    fts = {1: -12.0, 2: -10.0, 3: -9.0}
    out = embeddings.fuse(fts, [3, 4])
    assert min(out.values()) == pytest.approx(-12.0) and max(out.values()) == pytest.approx(-9.0)
    assert out[3] < out[2]  # in both lists beats FTS-only second place
    assert 4 in out  # vector-only hits join the pool


def test_fuse_without_fts_hits():
    out = embeddings.fuse({}, [7, 8, 9])
    assert sorted(out, key=out.get) == [7, 8, 9]


def test_unavailable_by_default(client):
    embeddings.reset()
    assert embeddings.index() is None  # EMBEDDINGS_PROVIDER=off in tests
    assert embeddings.search("گوشی", 10) is None


@pytest.fixture
def fake_index(client, monkeypatch):
    rows = db.catalog().execute("SELECT rid, title_fa FROM products ORDER BY rid").fetchall()
    rng = np.random.default_rng(0)
    mat = rng.normal(size=(len(rows), 16)).astype(np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    rids = np.array([r[0] for r in rows], dtype=np.int64)
    idx = embeddings.Index(mat.astype(np.float16), rids, {int(r): i for i, r in enumerate(rids)}, {})
    target = len(rows) // 2  # the query vector points straight at this product
    monkeypatch.setattr(embeddings, "_index", idx)
    monkeypatch.setattr(embeddings, "_loaded", True)
    monkeypatch.setattr(embeddings, "query_vector", lambda text: mat[target].copy())
    yield rows[target]
    embeddings.reset()


def test_vector_search_ranks_nearest_first(fake_index):
    assert embeddings.search("هر چیزی", 5)[0] == fake_index[0]


def test_hybrid_search_finds_what_fts_cannot(client, fake_index):
    r = client.get("/api/search", params={"q": "zzqqxx"}).json()  # no FTS match at all
    assert r["total"] > 0
    assert client.get("/api/meta").json()["flags"]["search_mode"] == "fts"  # no query embeddings: LLM is off


def test_similar_uses_vectors(client, fake_index):
    pid = db.catalog().execute("SELECT product_id FROM products WHERE rid=?", (fake_index[0],)).fetchone()[0]
    assert client.get(f"/api/products/{pid}/similar").status_code == 200
