"""Build api/data/catalog.db from data/raw/*.csv (ARCHITECTURE §3, DATA_CONTRACT §4–5).

Usage:
  python data/build_catalog.py            # full build
  python data/build_catalog.py --sample   # api/tests/fixtures/mini_catalog.db from an existing catalog.db

Idempotent: writes to a temp file and renames on success.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.hours import parse_weekly_hours  # noqa: E402
from app.parsing import (mall_key, parse_location, parse_payment, parse_specs,  # noqa: E402
                         parse_tristate, parse_warranty)
from app.text import normalize_fa  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "api" / "data" / "catalog.db"
SAMPLE_OUT = ROOT / "api" / "tests" / "fixtures" / "mini_catalog.db"

MALL_RADIUS_M = 150  # spec said 60m; addresses in this data place one mall's shops up to ~120m apart
AREA_MIN_SHOPS = 15
PRICE_MIN_PLAUSIBLE = 1_000
PRICE_MAX_PLAUSIBLE = 50_000_000_000
OUTLIER_FACTOR = 200  # categories are heterogeneous (a capacitor vs a PLC module); ×20 flagged real prices

# Home-screen category groups. Order matters: first match wins.
CATEGORY_GROUPS: list[tuple[str, str, list[str]]] = [
    ("mobile", "موبایل و تبلت", ["گوشی", "موبایل", "تبلت", "سیم کارت", "پاوربانک", "شارژر"]),
    ("laptop", "لپ‌تاپ و کامپیوتر", ["لپ تاپ", "لپ‌تاپ", "کامپیوتر", "مانیتور", "کیبورد", "ماوس", "هارد",
                                     "پرینتر", "کارت گرافیک", "حافظه", "فلش", "مودم", "شبکه"]),
    ("audio", "صوتی و تصویری", ["هدفون", "هندزفری", "هدست", "اسپیکر", "صوتی", "میکروفون", "تلویزیون",
                                "آمپلی", "پخش"]),
    ("security", "دوربین و امنیتی", ["دوربین مدار", "دزدگیر", "نظارتی", "امنیتی", "آیفون تصویری", "دوربین"]),
    ("lighting", "روشنایی", ["چراغ", "لامپ", "لوستر", "پروژکتور", "ریسه", "روشنایی", "وال واشر"]),
    ("electrical", "برق ساختمان", ["سیم و کابل", "کلید", "پریز", "فیوز", "کنتاکتور", "رله", "تابلو",
                                   "کابلشو", "خازن", "برق", "سوکت", "کانکتور", "ترانس"]),
    ("watch", "ساعت", ["ساعت"]),
    ("beauty", "آرایشی و بهداشتی", ["عطر", "ادکلن", "آرایش", "کرم", "سرم", "شامپو", "اصلاح", "ریش",
                                     "بهداشت", "مو "]),
    ("fashion", "پوشاک و کفش", ["کفش", "کتانی", "پیراهن", "شلوار", "کیف", "کوله", "لباس", "تی شرت",
                                "عینک", "مانتو", "پوشاک", "دمپایی", "صندل", "کت ", "جوراب"]),
    ("appliances", "لوازم خانگی", ["لوازم خانگی", "جارو", "یخچال", "لباسشویی", "اتو", "چای", "قهوه",
                                   "آشپزخانه", "هواکش", "کولر", "بخاری", "پنکه", "مخلوط", "سرخ کن"]),
    ("industrial", "ابزار و صنعتی", ["پمپ", "ژنراتور", "موتور", "پنوماتیک", "اتوماسیون", "اینورتر", "درایو",
                                     "شیر برقی", "جک", "صنعتی", "ابزار", "کف‌کش", "دریل", "جوش"]),
    ("car", "خودرو", ["خودرو", "سپر", "موتورسیکلت"]),
    ("toys", "اسباب‌بازی", ["اسباب بازی", "اسباب‌بازی", "عروسک", "پازل"]),
]


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nullish(v: str) -> bool:
    return v in ("", "null", "None")


def category_group(name: str) -> str:
    n = normalize_fa(name) + " "
    for key, _label, kws in CATEGORY_GROUPS:
        if any(normalize_fa(k) in n for k in kws):
            return key
    return "other"


SCHEMA = """
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE shops(
  shop_id TEXT PRIMARY KEY, name TEXT NOT NULL, is_real_name INTEGER NOT NULL,
  categories TEXT, primary_category TEXT,
  address TEXT, address_short TEXT, area TEXT, lat REAL, lng REAL,
  mall_id INTEGER, mall_name TEXT, floor_label TEXT, floor_order INTEGER, unit TEXT,
  phone TEXT, contacts_raw TEXT, instagram TEXT, website TEXT,
  torob_pay INTEGER, installments INTEGER, installment_types TEXT, kala_barg INTEGER,
  fast_delivery INTEGER, payment_raw TEXT,
  hours_known INTEGER NOT NULL, hours_json TEXT, hours_raw TEXT, offer_count INTEGER NOT NULL
);
CREATE TABLE shop_hours(shop_id TEXT, weekday INTEGER, open_min INTEGER, close_min INTEGER);
CREATE TABLE products(
  rid INTEGER PRIMARY KEY, product_id TEXT UNIQUE NOT NULL, title_fa TEXT, model TEXT, brand TEXT,
  category TEXT, category_group TEXT, image_urls TEXT, specs TEXT, specs_raw TEXT,
  offer_count INTEGER, min_price INTEGER, max_price INTEGER, latest_change TEXT, search_text TEXT
);
CREATE TABLE offers(
  offer_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, shop_id TEXT NOT NULL,
  seller_title TEXT, description TEXT, price_toman INTEGER, price_outlier INTEGER NOT NULL,
  last_price_changed_at TEXT, warranty_raw TEXT, warranty_provider TEXT, warranty_months INTEGER
);
CREATE VIRTUAL TABLE products_fts USING fts5(
  search_text, content='products', content_rowid='rid', tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE malls(mall_id INTEGER PRIMARY KEY, name TEXT, lat REAL, lng REAL, address TEXT,
                   area TEXT, shop_count INTEGER);
CREATE TABLE categories(name TEXT PRIMARY KEY, product_count INTEGER, shop_count INTEGER,
                        icon_key TEXT, parent TEXT);
CREATE TABLE category_groups(key TEXT PRIMARY KEY, label TEXT, product_count INTEGER,
                             shop_count INTEGER, sort INTEGER);
CREATE TABLE areas(area_id INTEGER PRIMARY KEY, name_fa TEXT, lat REAL, lng REAL, shop_count INTEGER);
"""

INDEXES = """
CREATE INDEX ix_offers_product ON offers(product_id);
CREATE INDEX ix_offers_shop ON offers(shop_id);
CREATE INDEX ix_shops_latlng ON shops(lat, lng);
CREATE INDEX ix_shops_mall ON shops(mall_id);
CREATE INDEX ix_hours_shop ON shop_hours(shop_id);
CREATE INDEX ix_products_category ON products(category);
CREATE INDEX ix_products_group ON products(category_group);
CREATE INDEX ix_products_brand ON products(brand);
"""


def build(out: Path) -> None:
    t0 = time.time()
    tmp = out.with_suffix(".tmp")
    if tmp.exists():
        tmp.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)

    log("reading CSVs")
    shops = pd.read_csv(RAW / "shops.csv", dtype=str, keep_default_na=False)
    products = pd.read_csv(RAW / "products.csv", dtype=str, keep_default_na=False)
    offers = pd.read_csv(RAW / "offers.csv", dtype=str, keep_default_na=False)
    log(f"shops={len(shops):,} products={len(products):,} offers={len(offers):,}")

    # ---------------------------------------------------------------- offers
    log("offers: prices, dates, warranty")
    offers["price"] = pd.to_numeric(offers.price_toman.replace({"": None, "null": None}), errors="coerce")
    offers.loc[offers.price <= 0, "price"] = None
    offers["changed"] = offers.last_price_changed_at.replace({"": None, "null": None})
    cat_of = dict(zip(products.product_id, products.category_name))
    offers["category"] = offers.product_id.map(cat_of)
    med = offers.groupby("category").price.median()
    offers["cat_median"] = offers.category.map(med)
    outlier = ((offers.price < PRICE_MIN_PLAUSIBLE) | (offers.price > PRICE_MAX_PLAUSIBLE)
               | (offers.price > offers.cat_median * OUTLIER_FACTOR)
               | (offers.price < offers.cat_median / OUTLIER_FACTOR))
    # Within one product, a price far from its siblings is almost always a typo (extra zero).
    grp = offers.groupby("product_id").price
    pmed, pn = grp.transform("median"), grp.transform("count")
    outlier |= (pn >= 3) & ((offers.price > pmed * 3) | (offers.price < pmed / 3))
    offers["outlier"] = (outlier & offers.price.notna()).astype(int)
    snapshot = pd.to_datetime(offers.changed, utc=True, format="ISO8601").max()

    warranties = [parse_warranty(w) for w in offers.warranty]

    # ---------------------------------------------------------------- products
    log("products: aggregates, specs, search text")
    valid = offers[offers.price.notna() & (offers.outlier == 0)]
    agg_price = valid.groupby("product_id").price.agg(["min", "max"])
    agg_cnt = offers.groupby("product_id").size()
    agg_latest = offers.groupby("product_id").changed.max()

    product_rows = []
    spec_key_counts: Counter = Counter()
    for rid, r in enumerate(products.itertuples(index=False), start=1):
        specs = parse_specs(r.specs)
        spec_key_counts.update(specs.keys())
        brand = None if nullish(r.brand_name) else r.brand_name
        model = None if nullish(r.model) else r.model
        imgs = r.image_urls if not nullish(r.image_urls) else "[]"
        search = normalize_fa(" ".join(filter(None, [r.persian_title, brand, model, r.category_name,
                                                      specs.get("برند")])))
        pmin = agg_price["min"].get(r.product_id)
        pmax = agg_price["max"].get(r.product_id)
        product_rows.append((
            rid, r.product_id, r.persian_title, model, brand, r.category_name, category_group(r.category_name),
            imgs, json.dumps(specs, ensure_ascii=False) if specs else None,
            None if nullish(r.specs) else r.specs,
            int(agg_cnt.get(r.product_id, 0)),
            None if pmin is None or pd.isna(pmin) else int(pmin),
            None if pmax is None or pd.isna(pmax) else int(pmax),
            agg_latest.get(r.product_id), search,
        ))

    # ---------------------------------------------------------------- shops
    log("shops: location, payment, hours, malls")
    offer_cnt = offers.groupby("shop_id").size()
    shop_cats_from_offers: dict[str, Counter] = defaultdict(Counter)
    for sid, cat in zip(offers.shop_id, offers.category):
        shop_cats_from_offers[sid][cat] += 1

    shop_rows, hour_rows = [], []
    mall_members: dict[str, list[int]] = defaultdict(list)
    parsed_shops = []
    for r in shops.itertuples(index=False):
        loc = parse_location(r.address)
        pay = parse_payment(r.payment_options)
        week = parse_weekly_hours(r.weekly_hours)
        try:
            cats = json.loads(r.category_names) if not nullish(r.category_names) else []
        except ValueError:
            cats = []
        oc = shop_cats_from_offers.get(r.shop_id)
        primary = oc.most_common(1)[0][0] if oc else (cats[0] if cats else None)
        phone = None
        try:
            for c in json.loads(r.contacts):
                if c.get("channel") == "phone":
                    phone = c.get("display_number")
                    break
        except ValueError:
            pass
        insta = None
        if not nullish(r.instagram):
            try:
                insta = json.loads(r.instagram).get("profile_url")
            except ValueError:
                insta = r.instagram
        website = None if nullish(r.website_url) else r.website_url
        parsed_shops.append(dict(
            shop_id=r.shop_id, name=r.name, is_real_name=int(bool(insta or website)),
            categories=json.dumps(cats, ensure_ascii=False), primary_category=primary,
            address=r.address, area=r.location_label.strip() or None,
            lat=float(r.lat), lng=float(r.lon), **loc, phone=phone, contacts_raw=r.contacts,
            instagram=insta, website=website, **pay, fast_delivery=parse_tristate(r.supports_fast_delivery),
            payment_raw=r.payment_options, hours_known=int(week is not None),
            hours_json=json.dumps(week) if week else None,
            hours_raw=None if nullish(r.weekly_hours) else r.weekly_hours,
            offer_count=int(offer_cnt.get(r.shop_id, 0)),
        ))
        if week:
            for wd, ranges in week.items():
                for a, b in ranges:
                    hour_rows.append((r.shop_id, wd, a, b))
        if loc["mall_name"]:
            mall_members[mall_key(loc["mall_name"])].append(len(parsed_shops) - 1)

    # Cluster malls: same loose key, then split by distance.
    malls = []
    for key, idxs in mall_members.items():
        clusters: list[list[int]] = []
        for i in idxs:
            s = parsed_shops[i]
            for c in clusters:
                clat = sum(parsed_shops[j]["lat"] for j in c) / len(c)
                clng = sum(parsed_shops[j]["lng"] for j in c) / len(c)
                if haversine_m(s["lat"], s["lng"], clat, clng) <= MALL_RADIUS_M:
                    c.append(i)
                    break
            else:
                clusters.append([i])
        for c in clusters:
            names = Counter(parsed_shops[j]["mall_name"] for j in c)
            mall_id = len(malls) + 1
            lat = sum(parsed_shops[j]["lat"] for j in c) / len(c)
            lng = sum(parsed_shops[j]["lng"] for j in c) / len(c)
            first = parsed_shops[c[0]]["address"]
            addr = first.split(names.most_common(1)[0][0])[0].strip(" ،,") or first
            area = Counter(parsed_shops[j]["area"] for j in c).most_common(1)[0][0]
            malls.append((mall_id, names.most_common(1)[0][0], lat, lng, addr, area, len(c)))
            for j in c:
                parsed_shops[j]["mall_id"] = mall_id
                parsed_shops[j]["mall_name"] = names.most_common(1)[0][0]

    for s in parsed_shops:
        s.setdefault("mall_id", None)
        if s["mall_name"]:
            short = s["mall_name"] + (f"، {s['floor_label']}" if s["floor_label"] else "")
        else:
            parts = [p.strip() for p in s["address"].replace(",", "،").split("،") if p.strip()]
            short = "، ".join(parts[:2])
        s["address_short"] = short

    cols = ["shop_id", "name", "is_real_name", "categories", "primary_category", "address", "address_short",
            "area", "lat", "lng", "mall_id", "mall_name", "floor_label", "floor_order", "unit", "phone",
            "contacts_raw", "instagram", "website", "torob_pay", "installments", "installment_types",
            "kala_barg", "fast_delivery", "payment_raw", "hours_known", "hours_json", "hours_raw", "offer_count"]
    shop_rows = [tuple(s[c] for c in cols) for s in parsed_shops]

    # ---------------------------------------------------------------- areas
    area_rows = []
    by_area = defaultdict(list)
    for s in parsed_shops:
        if s["area"]:
            by_area[s["area"]].append((s["lat"], s["lng"]))
    ranked = sorted(by_area.items(), key=lambda kv: -len(kv[1]))
    for i, (name, pts) in enumerate([kv for kv in ranked if len(kv[1]) >= AREA_MIN_SHOPS], start=1):
        lats = sorted(p[0] for p in pts)
        lngs = sorted(p[1] for p in pts)
        area_rows.append((i, name, lats[len(lats) // 2], lngs[len(lngs) // 2], len(pts)))

    # ---------------------------------------------------------------- categories
    prod_df = pd.DataFrame(product_rows, columns=["rid", "product_id", "title", "model", "brand", "category",
                                                   "group", "imgs", "specs", "specs_raw", "offer_count",
                                                   "min", "max", "latest", "search"])
    cat_products = prod_df.groupby("category").size()
    shop_cat = offers.groupby("category").shop_id.nunique()
    cat_rows = [(c, int(n), int(shop_cat.get(c, 0)), category_group(c), category_group(c))
                for c, n in cat_products.items()]
    grp_products = prod_df[prod_df.offer_count > 0].groupby("group").size()
    offers["group"] = offers.category.map(lambda c: category_group(c) if isinstance(c, str) else "other")
    grp_shops = offers.groupby("group").shop_id.nunique()
    group_rows = [(key, label, int(grp_products.get(key, 0)), int(grp_shops.get(key, 0)), i)
                  for i, (key, label, _) in enumerate(CATEGORY_GROUPS)]
    group_rows.append(("other", "سایر", int(grp_products.get("other", 0)), int(grp_shops.get("other", 0)), 99))

    # ---------------------------------------------------------------- write
    log("writing sqlite")
    con = sqlite3.connect(tmp)
    con.executescript(SCHEMA)
    con.executemany(f"INSERT INTO shops VALUES ({','.join('?' * len(cols))})", shop_rows)
    con.executemany("INSERT INTO shop_hours VALUES (?,?,?,?)", hour_rows)
    con.executemany(f"INSERT INTO products VALUES ({','.join('?' * 15)})", product_rows)
    offer_rows = [
        (r.offer_id, r.product_id, r.shop_id, r.seller_title, None if nullish(r.description) else r.description,
         None if pd.isna(r.price) else int(r.price), int(r.outlier), r.changed,
         w["warranty_raw"], w["warranty_provider"], w["warranty_months"])
        for r, w in zip(offers.itertuples(index=False), warranties)
    ]
    con.executemany(f"INSERT INTO offers VALUES ({','.join('?' * 11)})", offer_rows)
    con.execute("INSERT INTO products_fts(rowid, search_text) SELECT rid, search_text FROM products")
    con.executemany("INSERT INTO malls VALUES (?,?,?,?,?,?,?)", malls)
    con.executemany("INSERT INTO categories VALUES (?,?,?,?,?)", cat_rows)
    con.executemany("INSERT INTO category_groups VALUES (?,?,?,?,?)", group_rows)
    con.executemany("INSERT INTO areas VALUES (?,?,?,?,?)", area_rows)
    con.executescript(INDEXES)

    meta = {
        "snapshot_date": snapshot.isoformat(),
        "build_time": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "counts": json.dumps({"shops": len(shops), "products": len(products), "offers": len(offers),
                              "malls": len(malls), "areas": len(area_rows),
                              "shops_with_offers": int((offer_cnt > 0).sum()),
                              "real_name_shops": int(sum(s["is_real_name"] for s in parsed_shops))}),
        "top_spec_keys": json.dumps(spec_key_counts.most_common(50), ensure_ascii=False),
        "embeddings_info": json.dumps({"provider": "off"}),
    }
    con.executemany("INSERT INTO meta VALUES (?,?)", list(meta.items()))
    con.commit()
    con.execute("ANALYZE")
    con.close()
    os.replace(tmp, out)
    log(f"done in {time.time() - t0:.0f}s → {out} ({out.stat().st_size / 1e6:.0f} MB)")
    log(f"malls={len(malls)} areas={len(area_rows)} hours rows={len(hour_rows):,}")


def build_sample(src: Path, out: Path, n_random: int = 2000) -> None:
    """Small fixture DB: demo-like products (mobile phones with ≥3 sellers) plus random products."""
    if not src.exists():
        sys.exit(f"{src} missing; run the full build first")
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    con = sqlite3.connect(src)
    con.execute(f"ATTACH DATABASE '{out}' AS mini")
    schema = [r[0] for r in con.execute(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'products_fts_%' "
        "AND name NOT LIKE 'sqlite_%' AND type IN ('table') ORDER BY rowid")]
    for sql in schema:
        if sql.startswith("CREATE VIRTUAL TABLE"):
            con.execute(sql.replace("CREATE VIRTUAL TABLE products_fts", "CREATE VIRTUAL TABLE mini.products_fts"))
        else:
            con.execute(sql.replace("CREATE TABLE ", "CREATE TABLE mini.", 1))
    con.execute("""CREATE TEMP TABLE pick AS
        SELECT product_id FROM products WHERE category_group='mobile' AND offer_count>=3
        UNION SELECT product_id FROM (SELECT product_id FROM products WHERE offer_count>=1
                                       ORDER BY rid % 97, rid LIMIT ?)""", (n_random,))
    con.execute("INSERT INTO mini.products SELECT * FROM products WHERE product_id IN (SELECT product_id FROM pick)")
    con.execute("INSERT INTO mini.offers SELECT * FROM offers WHERE product_id IN (SELECT product_id FROM pick)")
    con.execute("""INSERT INTO mini.shops SELECT * FROM shops WHERE shop_id IN (SELECT shop_id FROM mini.offers)
                   OR shop_id IN (SELECT shop_id FROM shops WHERE area IN (SELECT name_fa FROM areas) LIMIT 300)""")
    con.execute("INSERT INTO mini.shop_hours SELECT * FROM shop_hours WHERE shop_id IN (SELECT shop_id FROM mini.shops)")
    for t in ["meta", "malls", "categories", "category_groups", "areas"]:
        con.execute(f"INSERT INTO mini.{t} SELECT * FROM {t}")
    con.execute("INSERT INTO mini.products_fts(rowid, search_text) SELECT rid, search_text FROM mini.products")
    for line in INDEXES.strip().splitlines():
        con.execute(line.replace("CREATE INDEX ", "CREATE INDEX mini.", 1))
    con.commit()
    n = con.execute("SELECT count(*) FROM mini.products").fetchone()[0]
    con.close()
    log(f"sample → {out} ({n} products, {out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true")
    args = ap.parse_args()
    if args.sample:
        build_sample(OUT, SAMPLE_OUT)
    else:
        build(OUT)
