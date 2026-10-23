FERDOWSI = {"lat": 35.6921, "lng": 51.4225}
CLOCK = {"X-Demo-Clock": "2026-10-21T17:40:00"}
STOCK_WORDS = ("موجود است", "موجوده", "داریم")


def test_health_and_meta(client):
    assert client.get("/api/health").json() == {"ok": True}
    m = client.get("/api/meta", headers=CLOCK).json()
    assert m["snapshot_date"].startswith("2026-10-13")
    assert m["now"].startswith("2026-10-21T17:40")
    assert any(c["key"] == "stock" for c in m["caveats"])


def test_areas_and_categories(client):
    areas = client.get("/api/areas").json()
    assert areas[0]["name"] == "فردوسی"
    cats = client.get("/api/categories").json()
    assert {"mobile", "other"} <= {c["key"] for c in cats}


def test_search_understood_chips_and_filters(client):
    r = client.get("/api/search", params={"q": "گوشی زیر ۸۰ میلیون اقساطی", **FERDOWSI}, headers=CLOCK).json()
    keys = {c["key"] for c in r["understood_chips"]}
    assert {"max", "pay"} <= keys
    for it in r["items"]:
        assert it["price_range"]["min"] is None or it["price_range"]["min"] <= 80_000_000
        assert it["reasons"] and all(len(x) <= 40 for x in it["reasons"])
        assert it["stock"]["state"] == "unknown"
    assert "installments" in r["excluded_unknown"]


def test_search_digits_and_arabic_letters_match(client):
    a = client.get("/api/search", params={"q": "گوشی"}).json()["total"]
    b = client.get("/api/search", params={"q": "گوشي"}).json()["total"]
    assert a == b and a > 0


def test_search_empty_offers_relax(client):
    r = client.get("/api/search", params={"q": "گوشی زیر ۱ هزار تومان"}).json()
    assert r["total"] == 0
    assert r["relax"] and r["relax"]["key"] == "max"


def test_product_detail_trust(client, demo_product):
    d = client.get(f"/api/products/{demo_product}").json()
    assert d["trust_summary"].startswith("قیمت‌ها ثبت‌شده‌اند")
    assert d["stock"]["state"] == "unknown"
    assert d["seller_count"] >= 3


def test_sellers_tiers_and_reasons(client, demo_product):
    r = client.get(f"/api/products/{demo_product}/sellers", params=FERDOWSI, headers=CLOCK).json()
    assert r["listed"], "demo product must have listed sellers"
    listed_ids = {row["shop"]["id"] for row in r["listed"]}
    for row in r["listed"]:
        assert row["tier"] == "listed"
        assert row["stock"]["state"] == "unknown"
        assert row["price"]["kind"] in ("listed", "none")
        if row["price"]["kind"] == "none":
            assert row["price"]["value"] is None
        assert row["reasons"]
        assert not any(w in x for x in row["reasons"] for w in STOCK_WORDS)
    for rel in r["related"]:
        assert rel["tier"] == "related" and "price" not in rel
        assert rel["shop"]["id"] not in listed_ids
    assert [row["rank"] for row in r["listed"]] == list(range(1, len(r["listed"]) + 1))


def test_sellers_modes_reorder(client, demo_product):
    get = lambda m: [x["shop"]["id"] for x in client.get(f"/api/products/{demo_product}/sellers",
                                                       params={**FERDOWSI, "mode": m}, headers=CLOCK).json()["listed"]]
    cheap, near = get("cheapest"), get("nearest")
    assert set(cheap) == set(near)


def test_sellers_without_location(client, demo_product):
    r = client.get(f"/api/products/{demo_product}/sellers").json()
    assert r["has_location"] is False
    assert all(row["distance_m"] is None for row in r["listed"])


def test_unknown_excluded_counts(client, demo_product):
    r = client.get(f"/api/products/{demo_product}/sellers", params={**FERDOWSI, "pay": "kala_barg"}).json()
    assert r["listed"] == []
    assert r["excluded_unknown"].get("kala_barg", 0) > 0


def test_similar_and_compare(client, demo_product):
    sim = client.get(f"/api/products/{demo_product}/similar", params=FERDOWSI).json()
    assert sim and all("همان دسته" in s["reasons"] for s in sim)
    ids = [demo_product] + [s["id"] for s in sim[:2]]
    cmp = client.post("/api/compare", json={"ids": ids, **FERDOWSI}).json()
    assert len(cmp["columns"]) == 3
    labels = [b for c in cmp["columns"] for b in c["best_for"]]
    assert "ارزان‌ترین" in labels


def test_shop_mall_and_errors(client, demo_product):
    r = client.get(f"/api/products/{demo_product}/sellers", params=FERDOWSI).json()
    sid = r["listed"][0]["shop"]["id"]
    shop = client.get(f"/api/shops/{sid}", headers=CLOCK).json()
    assert shop["phone_is_fictitious"] is True
    assert shop["open_status"]["label_fa"]
    if shop["hours"]:
        assert sum(d["is_today"] for d in shop["hours"]) == 1
    near = client.get("/api/malls/near", params=FERDOWSI, headers=CLOCK).json()
    assert near
    mall = client.get(f"/api/malls/{near[0]['id']}", headers=CLOCK).json()
    orders = [f["floor_order"] for f in mall["floors"] if f["floor_order"] is not None]
    assert orders == sorted(orders)
    e = client.get("/api/products/nope")
    assert e.status_code == 404 and e.json()["code"] == "not_found"


def test_search_removed_chip_and_unknown_inclusion(client):
    q = {"q": "گوشی زیر ۸۰ میلیون اقساطی", **FERDOWSI}
    base = client.get("/api/search", params=q, headers=CLOCK).json()
    assert base["applied"]["pay"] == ["installments"] and base["applied"]["max"] == 80_000_000
    chip = next(c for c in base["understood_chips"] if c["key"] == "pay")
    assert chip["id"] == "pay:installments"
    dropped = client.get("/api/search", params={**q, "ign": chip["id"]}, headers=CLOCK).json()
    assert dropped["applied"]["pay"] == [] and all(c["key"] != "pay" for c in dropped["understood_chips"])
    assert dropped["total"] >= base["total"]
    # Unknown sellers come back only on request, labelled «اقساطی؟», never as confirmed.
    assert base["unknown_sellers"].get("installments", 0) > 0
    inc = client.get("/api/search", params={**q, "unk": True}, headers=CLOCK).json()
    assert inc["applied"]["unknown"] and inc["total"] >= base["total"]
    assert all("اقساطی؟" not in it["reasons"] for it in base["items"])


def test_search_empty_explains_and_counts_each_relax(client):
    r = client.get("/api/search", params={"q": "گوشی زیر ۱ هزار تومان اقساطی"}).json()
    assert r["total"] == 0 and r["relax_options"]
    counts = [o["count"] for o in r["relax_options"]]
    assert counts == sorted(counts, reverse=True)
    assert r["relax_note"] and "سخت‌گیرترین" in r["relax_note"]


def test_search_radius_zero_means_any(client):
    r = client.get("/api/search", params={"q": "گوشی", "radius": 0, **FERDOWSI}).json()
    assert r["applied"]["radius"] is None


def test_compare_summary_leaders(client):
    ids = [it["id"] for it in client.get("/api/search", params={"q": "گوشی"}).json()["items"][:3]]
    r = client.post("/api/compare", json={"ids": ids, **FERDOWSI}).json()
    keys = [row["key"] for row in r["summary"]]
    assert keys[:2] == ["قیمت ثبت‌شده (تومان)", "تعداد فروشنده"]
    for row in r["summary"]:
        assert len(row["values"]) == len(ids)
        assert row["leader"] is None or 0 <= row["leader"] < len(ids)


def test_sellers_unknown_factors_without_location(client, demo_product):
    r = client.get(f"/api/products/{demo_product}/sellers").json()
    assert all("distance" in row["unknown_factors"] for row in r["listed"])
    assert all(row["arrival_note"] is None for row in r["listed"])
