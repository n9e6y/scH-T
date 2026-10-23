import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db, search, views

# Tests never call the real provider (CLAUDE.md): the LLM is off unless `make eval`.
os.environ["LLM_ENABLED"] = "false"

FIXTURE = Path(__file__).parent / "fixtures" / "mini_catalog.db"


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    if not FIXTURE.exists():
        pytest.skip("fixture DB missing; run `make data-sample`")
    db.set_catalog_path(FIXTURE)
    from app import appdb
    appdb.set_app_db_path(tmp_path_factory.mktemp("app") / "app.db")
    for f in (search.brand_dict, search.areas, search.group_labels, search._category_names, search._category_sizes):
        f.cache_clear()
    views._snapshot.cache_clear()
    from app.main import app
    return TestClient(app)


@pytest.fixture(scope="session")
def demo_product(client):
    con = db.catalog()
    return con.execute("SELECT product_id FROM products WHERE category_group='mobile' "
                       "ORDER BY offer_count DESC LIMIT 1").fetchone()[0]
