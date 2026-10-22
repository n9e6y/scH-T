from app.parsing import (mall_key, months_from_text, parse_floor, parse_location, parse_payment,
                         parse_specs, parse_warranty)


def test_floor_words():
    assert parse_floor("همکف") == ("همکف", 0)
    assert parse_floor("منفی یک") == ("زیرزمین", -1)
    assert parse_floor("منفی ۲") == ("زیرزمین 2", -2)
    assert parse_floor("زیر همکف") == ("زیرزمین", -1)
    assert parse_floor("دوم") == ("طبقه 2", 2)
    assert parse_floor("۳") == ("طبقه 3", 3)
    assert parse_floor("") == (None, None)


def test_location_full():
    loc = parse_location("خیابان جمهوری، نبش شیخ هادی، پاساژ علالدین 2، طبقه 6، واحد 622")
    assert loc == {"mall_name": "پاساژ علالدین 2", "floor_label": "طبقه 6", "floor_order": 6, "unit": "622"}


def test_location_no_mall():
    loc = parse_location("خیابان جمهوری اسلامی، بین شهریار و شیخ هادی، پلاک ۸۵۴")
    assert loc["mall_name"] is None and loc["floor_order"] is None


def test_location_persian_unit():
    loc = parse_location("سعدی جنوبی، مجتمع تجاری بوشهری، طبقه همکف، واحد ۱۲")
    assert loc["mall_name"] == "مجتمع تجاری بوشهری"
    assert loc["floor_order"] == 0 and loc["unit"] == "12"


def test_mall_key_variants():
    assert mall_key("پاساژ علاالدین") == mall_key("پاساژ علاءالدین") == mall_key("پاساژ علائدین")
    assert mall_key("پاساژ علاالدین") != mall_key("پاساژ علاالدین ۲")


def test_payment_tristate():
    assert parse_payment("[]") == {"torob_pay": None, "installments": None, "installment_types": None,
                                   "kala_barg": None}
    p = parse_payment('[{"provider_name":"ترب‌پی"},{"provider_name":"اسنپ‌پی"}]')
    assert p["torob_pay"] == 1 and p["installments"] == 1


def test_warranty():
    assert parse_warranty('{"description":"گارانتی 24 ماهه","period_months":null,"provider":null}')[
        "warranty_months"] == 24
    assert months_from_text("همراه با یکسال گارانتی") == 12
    assert months_from_text("دو ساله") == 24
    assert months_from_text("۱۸ ماهه") == 18
    assert parse_warranty(None)["warranty_months"] is None
    assert months_from_text("ضمانت اصالت قطعات") is None


def test_specs():
    raw = '[{"key":"برند","value":"دنا"},{"key":"مدل","value":"نامشحص"},{"key":"برند","value":"x"}]'
    assert parse_specs(raw) == {"برند": "دنا"}
