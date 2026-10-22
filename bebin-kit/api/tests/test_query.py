from app.query import parse_query
from app.text import normalize_fa

AREAS = ["فردوسی", "شیخ هادی", "تجریش"]
BRANDS = {normalize_fa(b): b for b in ["شیائومی", "سامسونگ"]} | {"jbl": "JBL"}


def p(q):
    return parse_query(q, BRANDS, AREAS)


def test_max_millions():
    r = p("کفش رانینگ زیر ۴ میلیون")
    assert r.filters == {"max": 4_000_000}
    assert r.text == "کفش رانینگ"
    assert r.chips[0].label == "حداکثر ۴ میلیون"


def test_max_without_unit_and_installments():
    r = p("گوشی زیر 40 اقساطی")
    assert r.filters["max"] == 40_000_000
    assert r.filters["pay"] == ["installments"]
    assert r.text == "گوشی"


def test_range():
    r = p("لپ تاپ بین ۳۰ و ۵۰ میلیون")
    assert r.filters["min"] == 30_000_000 and r.filters["max"] == 50_000_000
    assert r.text == "لپ تاپ"


def test_toman_and_hezar():
    assert p("شارژر تا ۹۰۰ هزار تومن").filters["max"] == 900_000


def test_word_numbers():
    assert p("هندزفری زیر دو میلیون").filters["max"] == 2_000_000


def test_decimal():
    assert p("گوشی زیر ۲.۵ میلیون").filters["max"] == 2_500_000


def test_flags_near_open_torobpay():
    r = p("اسپیکر نزدیک من که الان باز باشه ترب پی")
    assert r.filters["near"] is True and r.filters["open"] is True
    assert r.filters["pay"] == ["torob_pay"]
    assert r.text == "اسپیکر"


def test_area_and_brand():
    r = p("گوشی شیائومی نزدیک فردوسی")
    assert r.filters["area"] == "فردوسی" and r.filters["brand"] == "شیائومی"
    assert r.text == "گوشی شیایومی"


def test_latin_brand_and_arabic_letters():
    r = p("اسپيكر JBL")
    assert r.filters["brand"] == "JBL"
    assert r.text == "اسپیکر jbl"


def test_plain_query_untouched():
    r = p("Redmi A5")
    assert r.filters == {} and r.text == "redmi a5"
