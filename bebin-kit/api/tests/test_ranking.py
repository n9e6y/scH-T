from app.ranking import Candidate, rank


def cand(key, price, km, state="open", fresh="fresh", **kw):
    return Candidate(key=key, price=price, price_kind="listed" if price else "none", freshness=fresh,
                     route_km=km, open_state=state, distance_m=km * 1000 / 1.35 if km is not None else None,
                     closes_at="21:00" if state == "open" else None, **kw)


ROWS = [
    cand("A", 3_650_000, 1.08, installments=1, warranty_months=6),
    cand("B", 3_790_000, 1.9, state="closing_soon", fresh="stale"),
    cand("C", 3_980_000, 3.1, state="unknown"),
    cand("D", 3_720_000, 4.2, state="closed"),
]


def test_balanced_order_and_reasons():
    r = rank(ROWS, "balanced")
    assert [s.candidate.key for s in r][0] == "A"
    a = r[0]
    assert a.reasons[0] == "ارزان‌ترین قیمت ثبت‌شده"
    assert "اقساطی" in a.reasons
    assert len(a.reasons) <= 3 and all(len(x) <= 40 for x in a.reasons)


def test_stale_caution_kept():
    b = next(s for s in rank(ROWS, "balanced") if s.candidate.key == "B")
    assert "قیمت قدیمی" in b.reasons


def test_modes_change_order():
    cheap = [s.candidate.key for s in rank(ROWS, "cheapest")]
    near = [s.candidate.key for s in rank(ROWS, "nearest")]
    assert cheap[0] == "A" and near[0] == "A"
    assert cheap.index("D") < near.index("D") or cheap != near


def test_null_price_scores_low_and_no_price_reason():
    rows = ROWS + [cand("E", None, 0.5)]
    e = next(s for s in rank(rows, "cheapest") if s.candidate.key == "E")
    assert e.components["price"] == 0.3
    assert not any("قیمت" in x for x in e.reasons)


def test_no_location_excludes_distance():
    r = rank(ROWS, "balanced", has_location=False)
    assert all(s.components["distance"] == 0.5 for s in r)
    assert not any("تا اینجا" in x for s in r for x in s.reasons)


def test_verified_in_stock_boosts():
    rows = [cand("X", 3_700_000, 2.0), cand("Y", 3_700_000, 2.0, stock="in_stock")]
    assert rank(rows, "balanced")[0].candidate.key == "Y"
