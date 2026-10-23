"""Ask-the-store engine (ARCHITECTURE §10): simulator determinism, lifecycle, propagation, panel, alternatives."""
import time

from app.inquiries import engine
from app.inquiries.simulator import OfferFacts, ShopFacts, plan, price_spoken

FERDOWSI = {"lat": 35.6921, "lng": 51.4225}
CLOCK = {"X-Demo-Clock": "2026-10-21T17:40:00"}
H = {"X-Session-Id": "test-session", **CLOCK}

SHOP = ShopFacts(open_state="open", closes_at="21:00", hours_today=["10:00–21:00"], installments=None,
                 installment_types=[], floor_label="طبقه ۲", unit="۲۱۴", mall_name="پاساژ نگین", address_short="")
OFFER = OfferFacts(price=3_650_000, freshness="fresh", listed=True)
Q = ["price", "stock", "location", "installments"]


def test_simulator_is_deterministic_and_honest():
    a = plan("abc", Q, "سایز ۴۳", None, SHOP, OFFER, 1.0, 90)
    b = plan("abc", Q, "سایز ۴۳", None, SHOP, OFFER, 1.0, 90)
    assert a == b
    assert a.answer_after is None or a.answer_after < 90
    closed = plan("abc", Q, None, None, ShopFacts(**{**SHOP.__dict__, "open_state": "closed"}), OFFER, 1.0, 90)
    assert closed.outcome == "no_answer" and closed.seen_after is None
    out = plan("xyz", Q, "سایز ۴۳", None, SHOP, OFFER, 1.0, 90, override="out_of_stock")
    assert out.outcome == "out_of_stock" and out.answer["stock"] == "out_of_stock"
    up = plan("xyz", Q, None, None, SHOP, OFFER, 1.0, 90, override="price_up")
    assert up.answer["price"] > OFFER.price and up.answer["price"] % 10_000 == 0
    assert up.answer["simulated"] is True and up.answer["message"]
    assert up.answer["location"] == "طبقه ۲، واحد ۲۱۴"


def test_price_spoken():
    assert price_spoken(3_700_000) == "۳ میلیون و ۷۰۰"
    assert price_spoken(89_000_000) == "۸۹ میلیون"
    assert price_spoken(91_030_000) == "۹۱ میلیون و ۳۰ هزار"


def _shop_for(client, product):
    rows = client.get(f"/api/products/{product}/sellers", params=FERDOWSI, headers=CLOCK).json()["listed"]
    return next(r for r in rows if r["open_now"]["state"] in ("open", "closing_soon"))


def test_compose_prechecks(client, demo_product):
    shop = _shop_for(client, demo_product)
    c = client.get("/api/inquiries/compose", params={"shop_ids": shop["shop"]["id"], "product_id": demo_product},
                   headers=CLOCK).json()
    keys = {q["key"]: q for q in c["questions"]}
    assert keys["price"]["checked"] and keys["stock"]["checked"] and keys["stock"]["field"] == "detail"
    assert not keys["hold"]["checked"] and c["hold_options"]


def test_lifecycle_answer_propagates_to_sellers(client, demo_product):
    shop = _shop_for(client, demo_product)
    client.post("/api/demo/override", json={"shop_id": shop["shop"]["id"], "outcome": "answer"})
    r = client.post("/api/inquiries", headers=H, json={"shop_ids": [shop["shop"]["id"]], "product_id": demo_product,
                                                      "questions": ["price", "stock"], "detail": "مشکی"})
    assert r.status_code == 200, r.text
    inq = r.json()[0]
    assert inq["status"] == "sent" and inq["steps"][-1]["state"] == "waiting"
    engine.scheduler.run_due(time.time() + 3600)
    inq = client.get(f"/api/inquiries/{inq['id']}", headers=H).json()
    assert inq["status"] == "answered" and inq["outcome"] == "answered" and inq["unread"]
    assert inq["simulated"] and inq["message"]
    assert any(a["key"] == "stock" and a["value"].startswith("موجود") for a in inq["answers"])
    rows = client.get(f"/api/products/{demo_product}/sellers", params=FERDOWSI, headers=CLOCK).json()["listed"]
    mine = next(x for x in rows if x["shop"]["id"] == shop["shop"]["id"])
    assert mine["stock"]["state"] == "in_stock" and mine["price"]["kind"] == "verified"
    lst = client.get("/api/inquiries", headers=H).json()
    assert lst["unread"] >= 1
    client.post(f"/api/inquiries/{inq['id']}/read", headers=H)
    assert not client.get(f"/api/inquiries/{inq['id']}", headers=H).json()["unread"]


def test_no_answer_nudge_and_alternatives(client, demo_product):
    shop = _shop_for(client, demo_product)
    client.post("/api/demo/override", json={"shop_id": shop["shop"]["id"], "outcome": "no_answer"})
    inq = client.post("/api/inquiries", headers=H, json={"shop_ids": [shop["shop"]["id"]], "product_id": demo_product,
                                                        "questions": ["price"]}).json()[0]
    engine.scheduler.run_due(time.time() + 3600)
    inq = client.get(f"/api/inquiries/{inq['id']}", headers=H).json()
    assert inq["status"] == "no_answer" and inq["failure_note"] and inq["can_nudge"]
    alt = client.get("/api/alternatives", params={"product_id": demo_product, "failed": shop["shop"]["id"], **FERDOWSI},
                     headers=CLOCK).json()
    assert alt["tiers"] and alt["tiers"][0]["key"] == "same_product"
    assert all(i["shop_id"] != shop["shop"]["id"] for i in alt["tiers"][0]["items"])
    n = client.post(f"/api/inquiries/{inq['id']}/nudge", headers=H).json()
    assert n["status"] == "delivered" and not n["can_nudge"]


def test_cancel_and_ownership(client, demo_product):
    shop = _shop_for(client, demo_product)
    inq = client.post("/api/inquiries", headers=H, json={"shop_ids": [shop["shop"]["id"]], "product_id": demo_product,
                                                        "questions": ["stock"]}).json()[0]
    assert client.get(f"/api/inquiries/{inq['id']}", headers={"X-Session-Id": "someone-else"}).status_code == 404
    c = client.post(f"/api/inquiries/{inq['id']}/cancel", headers=H).json()
    assert c["status"] == "cancelled" and not c["can_cancel"]


def test_seller_panel_manual_reply(client, demo_product):
    shop = _shop_for(client, demo_product)["shop"]["id"]
    client.post("/api/seller/presence", params={"shop_id": shop})
    inq = client.post("/api/inquiries", headers=H, json={"shop_ids": [shop], "product_id": demo_product,
                                                        "questions": ["price", "stock"]}).json()[0]
    assert inq["channel"] == "panel"
    engine.scheduler.run_due(time.time() + 5)
    inbox = client.get("/api/seller/inbox", params={"shop_id": shop}, headers=CLOCK).json()
    item = next(i for i in inbox["new"] if i["inquiry"]["id"] == inq["id"])
    assert item["inquiry"]["status"] == "seen"
    r = client.post(f"/api/seller/inquiries/{inq['id']}/reply",
                    json={"stock": "out_of_stock", "message": "تموم شده"}).json()
    assert r["outcome"] == "out_of_stock" and not r["simulated"]
    rows = client.get(f"/api/products/{demo_product}/sellers", params=FERDOWSI, headers=CLOCK).json()
    assert shop in {x["shop"]["id"] for x in rows["unavailable"]}
    assert shop not in {x["shop"]["id"] for x in rows["listed"]}


def test_wording_keeps_template_without_llm():
    from app.inquiries.wording import rephrase, _numbers
    msg = "سلام، بله موجوده. قیمت امروز ۳ میلیون و ۷۰۰ هست."
    assert rephrase({"message": msg, "simulated": True}) == msg
    assert _numbers("۳٬۷۰۰٬۰۰۰ و 21:00") == {"۳۷۰۰۰۰۰", "21:00"}


def test_plan_orders_groups_and_warns(client, demo_product):
    rows = client.get(f"/api/products/{demo_product}/sellers", params=FERDOWSI, headers=CLOCK).json()["listed"][:4]
    body = {"stops": [{"shop_id": r["shop"]["id"], "product_id": demo_product} for r in rows], "start_label": "فردوسی", **FERDOWSI}
    p = client.post("/api/plan", json=body, headers=CLOCK).json()
    assert p["stops"] and p["nav_url"].startswith("https://www.google.com/maps/dir/")
    assert sum(len(s["subs"]) for s in p["stops"]) == len(rows)
    assert p["stops"][0]["leg"].startswith("از فردوسی")
    late = client.post("/api/plan", json=body, headers={"X-Demo-Clock": "2026-10-24T23:30:00"}).json()
    assert all(s["status"] in ("closed_now", "unknown", "closed_on_arrival") for s in late["stops"])
    assert late["demo_clock"]
