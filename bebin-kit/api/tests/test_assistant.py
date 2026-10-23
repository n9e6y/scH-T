"""Assistant (ARCHITECTURE §11.3) without the provider: tools produce blocks from real services; with the LLM off
the chat falls back to keyword search with a notice (21d)."""
import json
from datetime import datetime

from app.assistant import tools
from app.hours import TEHRAN

AT = datetime(2026, 10, 21, 17, 40, tzinfo=TEHRAN)


def _events(text):
    out = []
    for chunk in text.split("\n\n"):
        data = [l[6:] for l in chunk.split("\n") if l.startswith("data: ")]
        if data:
            out.append(json.loads(data[0]))
    return out


def test_chat_falls_back_without_llm(client):
    r = client.post("/api/assistant/chat", headers={"X-Session-Id": "a1"},
                    json={"messages": [{"role": "user", "content": "گوشی سامسونگ"}], "context": {"lat": 35.6921, "lng": 51.4225}})
    ev = _events(r.text)
    assert ev[0]["type"] == "block" and ev[0]["block"]["type"] == "notice"
    pl = next(e for e in ev if e["type"] == "block" and e["block"]["type"] == "product_list")
    assert pl["block"]["plain"] and all(not i["reasons"] for i in pl["block"]["items"])
    assert ev[-1]["type"] == "done" and ev[-1]["fallback"]


def test_tools_return_blocks_and_never_claim_stock(client, demo_product):
    ctx = tools.Ctx(at=AT, lat=35.6921, lng=51.4225, location_name="فردوسی")
    s = tools.run(ctx, "search_products", json.dumps({"query": "گوشی", "installments": True}))
    assert s.blocks and s.blocks[0].type == "product_list" and s.for_model["total"] >= 1
    f = tools.run(ctx, "find_sellers", json.dumps({"product_id": demo_product}))
    assert f.blocks[0].type == "seller_list"
    assert all(r["stock"] == "unknown" or r["stock"] in ("in_stock", "out_of_stock") for r in f.for_model["rows"])
    shop = f.for_model["rows"][0]["shop_id"]
    p = tools.run(ctx, "propose_inquiry", json.dumps({"shop_ids": [shop], "product_id": demo_product, "questions": ["price", "stock"]}))
    assert p.blocks[0].type == "inquiry_confirm" and p.blocks[0].shops[0].id == shop
    bad = tools.run(ctx, "nope", "{}")
    assert "error" in bad.for_model


def test_only_first_search_becomes_a_block(client):
    ctx = tools.Ctx(at=AT, lat=None, lng=None, location_name=None)
    a = tools.run(ctx, "search_products", json.dumps({"query": "گوشی"}))
    b = tools.run(ctx, "search_products", json.dumps({"query": "گوشی سامسونگ"}))
    assert a.blocks and not b.blocks and b.done is None and b.for_model["total"] >= 0


def test_search_block_stays_relevant_and_links_with_its_filters(client):
    """The 3 suggestions are the search page's top 3 (even if the model sends a sort), and the link keeps the filters."""
    from app import search
    args = {"query": "گوشی", "installments": True, "max_price": 90_000_000}
    ctx = lambda: tools.Ctx(at=AT, lat=35.6921, lng=51.4225, location_name="فردوسی")  # noqa: E731
    rel = tools.run(ctx(), "search_products", json.dumps(args))
    near = tools.run(ctx(), "search_products", json.dumps({**args, "sort": "nearest"}))
    page = search.search(search.Params(q="گوشی", pay=["installments"], max=90_000_000, lat=35.6921, lng=51.4225), AT)
    top3 = [c.id for c in page.items[:3]]
    assert [c.id for c in rel.blocks[0].items] == top3
    assert [c.id for c in near.blocks[0].items] == top3
    link = rel.blocks[0].search
    assert "pay=installments" in link and "max=90000000" in link and "sort" not in link
