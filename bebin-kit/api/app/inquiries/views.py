"""View-ready inquiry objects (ARCHITECTURE §12): timeline steps, answer rows, previews, failure notes and the
composer's smart pre-checks. All Persian copy for the ask-the-store flow is built here, not in web/."""
from __future__ import annotations

import json
from datetime import datetime

from app import fa
from app.db import catalog
from app.hours import TEHRAN
from app.inquiries import facts
from app.models import (AnswerField, ComposeOut, ComposeQuestion, ComposeRecipient, InquiryOut, InquiryProduct,
                        InquiryStep, SellerShop)
from app.fa import jalali as jalali_or_none
from app.views import first_image, open_status_view, shop_ref

LABELS = {"price": "قیمت امروز", "stock": "موجودی", "has_model": "این مدل را دارد؟", "hours": "ساعت کاری",
          "location": "جای دقیق", "installments": "شرایط اقساط", "hold": "نگه داشتن"}


def hm(iso: str | None) -> str | None:
    if not iso:
        return None
    return fa.digits(datetime.fromisoformat(iso).astimezone(TEHRAN).strftime("%H:%M"))


def product_ref(product_id: str | None) -> InquiryProduct | None:
    if not product_id:
        return None
    p = catalog().execute("SELECT product_id, title_fa, model, image_urls FROM products WHERE product_id=?",
                          (product_id,)).fetchone()
    if not p:
        return None
    return InquiryProduct(id=p["product_id"], title=p["title_fa"], model=p["model"], image=first_image(p["image_urls"]))


def ask_text(questions: list[str], detail: str | None, hold_until: str | None, note: str | None) -> str:
    d = fa.digits(detail) if detail else None
    parts = {
        "price": "قیمت امروز؟",
        "stock": f"{d} موجود است؟" if d else "موجود است؟",
        "has_model": "این مدل را دارید؟",
        "hours": "امروز تا کی باز هستید؟",
        "location": "دقیقاً کجای پاساژ هستید؟",
        "installments": "شرایط اقساط؟",
        "hold": f"{fa.digits(hold_until)} برام نگه می‌دارید؟" if hold_until else "برام نگه می‌دارید؟",
    }
    text = " ".join(parts[q] for q in questions if q in parts)
    return f"{text} {note.strip()}".strip() if note and note.strip() else text


def _outcome(row, answer: dict | None) -> str:
    if row["status"] == "answered":
        return "out_of_stock" if (answer or {}).get("stock") == "out_of_stock" else "answered"
    if row["status"] in ("no_answer", "cancelled"):
        return row["status"]
    return "waiting"


def _steps(row, outcome: str) -> list[InquiryStep]:
    steps = [InquiryStep(key="sent", label="ارسال شد", state="done", at=hm(row["created_at"]))]
    if row["delivered_at"]:
        steps.append(InquiryStep(key="delivered", label="تحویل شد", state="done", at=hm(row["delivered_at"])))
    if row["seen_at"]:
        steps.append(InquiryStep(key="seen", label="دیده شد", state="done", at=hm(row["seen_at"])))
    if outcome == "answered":
        steps.append(InquiryStep(key="answered", label="جواب داد", state="answered", at=hm(row["answered_at"])))
    elif outcome == "out_of_stock":
        steps.append(InquiryStep(key="answered", label="ناموجود", state="out", at=hm(row["answered_at"])))
    elif outcome == "no_answer":
        label = "جواب نداد" if row["seen_at"] else f"جواب نداد ({_wait_label(row)})"
        steps.append(InquiryStep(key="no_answer", label=label, state="failed", at=hm(row["deadline_at"])))
    elif outcome == "cancelled":
        steps.append(InquiryStep(key="cancelled", label="لغو شد", state="failed", at=hm(row["updated_at"])))
    else:
        if not row["delivered_at"]:
            steps.append(InquiryStep(key="delivered", label="تحویل", state="pending"))
        steps.append(InquiryStep(key="answer", label="جواب", state="waiting", at="منتظر…"))
    return steps


def _wait_label(row) -> str:
    secs = (datetime.fromisoformat(row["deadline_at"]) - datetime.fromisoformat(row["created_at"])).total_seconds()
    secs = max(1, round(secs))
    return f"{fa.digits(secs)} ثانیه" if secs < 120 else f"{fa.digits(round(secs / 60))} دقیقه"


def _answers(row, answer: dict, listed_price: int | None) -> list[AnswerField]:
    out = []
    for q in json.loads(row["questions"]):
        if q == "price":
            v = answer.get("price")
            sub = None
            if v and listed_price and v != listed_price:
                diff = v - listed_price
                sub = f"{fa.number(abs(diff))} {'بیشتر' if diff > 0 else 'کمتر'} از قیمت ثبت‌شده ({fa.number(listed_price)})"
            out.append(AnswerField(key=q, label=LABELS[q], value=f"{fa.number(v)} تومان" if v else None, sub=sub))
        elif q in ("stock", "has_model"):
            st = answer.get("stock")
            d = answer.get("stock_detail")
            val = None
            if st == "in_stock":
                val = f"موجود است{('، ' + fa.digits(d)) if d else ''}"
            elif st == "out_of_stock":
                val = "ناموجود"
            out.append(AnswerField(key=q, label=LABELS[q], value=val))
        elif q == "hours":
            out.append(AnswerField(key=q, label=LABELS[q], value=answer.get("hours_today")))
        elif q == "location":
            out.append(AnswerField(key=q, label=LABELS[q], value=answer.get("location")))
        elif q == "installments":
            out.append(AnswerField(key=q, label=LABELS[q], value=answer.get("installments")))
        elif q == "hold":
            out.append(AnswerField(key=q, label=LABELS[q], value=answer.get("hold")))
    return out


def _preview(row, outcome: str, answer: dict, open_now) -> str:
    if outcome == "answered":
        bits = []
        if answer.get("stock") == "in_stock":
            bits.append("موجود است" + (f"، {fa.digits(answer['stock_detail'])}" if answer.get("stock_detail") else ""))
        if answer.get("price"):
            bits.append(f"{fa.number(answer['price'])} تومان")
        if not bits and answer.get("location"):
            bits.append(answer["location"])
        return "، ".join(bits) or "جواب داد"
    if outcome == "out_of_stock":
        return "ناموجود"
    if outcome == "no_answer":
        return "جایگزین‌ها آماده است" if row["product_id"] else "جواب نداد"
    if outcome == "cancelled":
        return "لغو شد"
    if open_now.state == "closed":
        opens = open_now.opens_at
        return f"بسته است؛ احتمالاً بعد از {fa.digits(opens.time)} جواب می‌دهد" if opens else "بسته است؛ بعد از باز شدن جواب می‌دهد"
    return "منتظر جواب"


def _failure_note(row, outcome: str, open_now) -> str | None:
    if outcome != "no_answer":
        return None
    if open_now.state == "closed":
        return "فروشگاه الان بسته است؛ پیام را بعد از باز شدن می‌بیند."
    note = f"در {_wait_label(row)} پیام را باز نکرد." if not row["seen_at"] else "پیام را دید ولی هنوز جواب نداده."
    if open_now.state == "closing_soon" and open_now.minutes_to_close:
        note += f" این فروشگاه {fa.digits(open_now.minutes_to_close)} دقیقه دیگر می‌بندد؛ شاید سرش شلوغ است."
    return note


def inquiry_out(row) -> InquiryOut:
    s = facts.shop_row(row["shop_id"])
    answer = json.loads(row["answer"]) if row["answer"] else {}
    outcome = _outcome(row, answer)
    now_v = datetime.fromisoformat(row["updated_at"])
    open_now = open_status_view(s, now_v)
    listed_price, listed_note = None, None
    if row["product_id"]:
        o = facts.offer_row(row["shop_id"], row["product_id"])
        if o and o["price_toman"] and not o["price_outlier"]:
            listed_price = o["price_toman"]
            d = jalali_or_none(o["last_price_changed_at"])
            listed_note = f"ثبت‌شده در فهرست: {fa.number(listed_price)} تومان" + (f"، تغییر قیمت {d}." if d else ".")
    return InquiryOut(
        id=row["id"], status=row["status"], outcome=outcome, shop=shop_ref(s), product=product_ref(row["product_id"]),
        tier=row["tier"] or "listed", questions=json.loads(row["questions"]),
        ask_text=ask_text(json.loads(row["questions"]), row["detail"], row["hold_until"], row["note"]),
        detail=row["detail"], hold_until=row["hold_until"], note=row["note"], channel=row["channel"],
        simulated=bool(answer.get("simulated")) if answer else row["channel"] == "simulated",
        created_at=row["created_at"], updated_at=row["updated_at"], answered_at=row["answered_at"],
        unread=row["status"] in ("answered", "no_answer") and not row["read_at"],
        steps=_steps(row, outcome), answers=_answers(row, answer, listed_price) if row["status"] == "answered" else [],
        message=answer.get("message"), preview=_preview(row, outcome, answer, open_now),
        failure_note=_failure_note(row, outcome, open_now),
        listed_note=listed_note if row["status"] == "answered" else None,
        can_nudge=not row["nudged"] and row["status"] in ("no_answer", "seen", "delivered"),
        can_cancel=row["status"] in ("sent", "delivered", "seen"), open_now=open_now,
        buyer="یک خریدار", buyer_distance_m=row["buyer_distance_m"])


# ---------------------------------------------------------------- composer
def _hold_options(at: datetime, closes_at: str | None, closed: bool) -> list[str]:
    if closed:
        return ["فردا ۱۴:۰۰", "فردا ۱۸:۰۰"]
    close_h = int(closes_at.split(":")[0]) if closes_at else 21
    start = at.hour + 2
    hours = [h for h in range(start, min(close_h, 23) + 1)][:3]
    return [fa.digits(f"{h:02d}:00") for h in hours] or [fa.digits(f"{close_h:02d}:00")]


def compose(shop_ids: list[str], product_id: str | None, preset: list[str], at: datetime,
            open_alternatives: list[ComposeRecipient]) -> ComposeOut:
    from app.inquiries.facts import load
    shops = [facts.shop_row(i) for i in shop_ids]
    shops = [s for s in shops if s]
    recips = [ComposeRecipient(id=s["shop_id"], name=s["name"], open_now=open_status_view(s, at)) for s in shops]
    loaded = [load(s["shop_id"], product_id, at) for s in shops]
    multi = len(shops) > 1
    product = product_ref(product_id)
    qs: list[ComposeQuestion] = []

    if product:
        related = all(o is not None and not o.listed for _, o in loaded)
        if related:
            qs.append(ComposeQuestion(key="has_model", label="این مدل را دارید؟", checked=True,
                                      hint="این کالا در فهرستشان نیست؛ شاید داشته باشند.", field="detail"))
        else:
            prices = [o for _, o in loaded if o and o.price]
            if multi:
                stale = any(o.freshness == "stale" for o in prices)
                hint = ("یکی قدیمی است و هیچ‌کدام تأیید نشده." if stale else "قیمت‌ها ثبت‌شده‌اند؛ هیچ‌کدام تأیید نشده.")
            elif prices:
                o = prices[0]
                row = facts.offer_row(shops[0]["shop_id"], product_id)
                d = jalali_or_none(row["last_price_changed_at"]) if row else None
                hint = f"ثبت‌شده: {fa.number(o.price)} تومان" + (f"، {d}" if d else "")
                if o.freshness == "stale":
                    hint += "؛ قدیمی است"
            else:
                hint = "قیمت ثبت نشده."
            qs.append(ComposeQuestion(key="price", label="قیمت امروز", hint=hint, checked=True))
            qs.append(ComposeQuestion(key="stock", label="موجودی", hint="موجودی هیچ‌وقت ثبت نمی‌شود؛ باید پرسید.",
                                      checked=True, field="detail"))

    states = [r.open_now for r in recips]
    any_closed = any(st.state == "closed" for st in states)
    if multi:
        bits = []
        if any(st.state == "closing_soon" for st in states):
            bits.append("یکی زود می‌بندد")
        if any(st.state == "unknown" for st in states):
            bits.append("یکی ساعتش را ثبت نکرده")
        hint = "، ".join(bits) + "." if bits else "ساعت‌ها ثبت‌شده‌اند."
        checked = bool(bits)
        label = "ساعت کاری امروز"
    else:
        st = states[0] if states else None
        label = "ساعت کاری فردا" if st and st.state == "closed" else "ساعت کاری امروز"
        if st is None or st.state == "unknown":
            hint, checked = "ساعت کاری ثبت نشده.", True
        elif st.state == "closed":
            hint, checked = (f"ثبت‌شده: {st.opens_at.weekday_fa} از {fa.digits(st.opens_at.time)}" if st.opens_at else "بسته است."), False
        elif st.state == "closing_soon":
            hint, checked = f"ثبت‌شده: {fa.digits(st.label_fa)}", True
        else:
            hint, checked = (f"ثبت‌شده: امروز تا {fa.digits(st.closes_at)}" if st.closes_at else "ثبت‌شده."), False
    qs.append(ComposeQuestion(key="hours", label=label, hint=hint, checked=checked or "hours" in preset))

    missing = [s for s in shops if s["mall_id"] and not (s["floor_label"] and s["unit"])]
    if missing:
        hint = f"{missing[0]['name']} طبقه و واحد را ثبت نکرده." if multi else "طبقه و واحد ثبت نشده."
    elif shops and shops[0]["mall_id"] and not multi:
        hint = fa.digits(f"ثبت‌شده: {shops[0]['floor_label']}، واحد {shops[0]['unit']}")
    else:
        hint = "نشانی ثبت‌شده است."
    qs.append(ComposeQuestion(key="location", label="جای دقیق در پاساژ" if any(s["mall_id"] for s in shops) else "جای دقیق",
                              hint=hint, checked=bool(missing) or "location" in preset))

    inst = [s["installments"] for s in shops]
    if multi:
        hint = "شرایط اقساط هر فروشگاه را بپرس."
    elif inst and inst[0] == 1:
        hint = "این فروشگاه اقساط را ثبت کرده؛ شرایطش را بپرس."
    elif inst and inst[0] == 0:
        hint = "این فروشگاه اقساط را ثبت نکرده."
    else:
        hint = "اقساط این فروشگاه نامشخص است."
    qs.append(ComposeQuestion(key="installments", label="شرایط اقساط", hint=hint, checked="installments" in preset))
    if product:
        qs.append(ComposeQuestion(key="hold", label="برام نگه دارید تا …", field="hold",
                                  hint="فروشنده کالا را تا ساعتی که می‌گویی کنار می‌گذارد.", checked=False))

    single = recips[0] if len(recips) == 1 else None
    closed_note = None
    if single and single.open_now.state == "closed":
        o = single.open_now.opens_at
        closed_note = f"الان بسته است؛ احتمالاً بعد از ساعت {fa.digits(o.time)} جواب می‌دهد." if o else "الان بسته است؛ بعد از باز شدن جواب می‌دهد."
    eta = ("جواب‌ها جداگانه در «پیگیری‌ها» می‌آیند." if multi
           else "پیام می‌ماند تا فروشنده بعد از باز شدن ببیند." if any_closed
           else "جواب که برسد خبرت می‌کنم؛ می‌توانی از این صفحه بیرون بروی.")
    first_open = next((st for st in states if st.state != "closed"), states[0] if states else None)
    return ComposeOut(
        title=f"از {fa.digits(len(recips))} فروشنده بپرس" if multi else "از فروشگاه بپرس",
        recipients=recips, product=product, questions=qs,
        hold_options=_hold_options(at, first_open.closes_at if first_open else None, bool(single and any_closed)),
        eta_note=eta, closed_note=closed_note, open_alternatives=open_alternatives if closed_note else [])


def seller_shop(s, new_count: int = 0) -> SellerShop:
    place = s["mall_name"] or s["address_short"] or s["area"] or ""
    if s["mall_name"] and s["unit"]:
        place = f"{s['mall_name']}، واحد {s['unit']}"
    return SellerShop(id=s["shop_id"], name=s["name"], place=fa.digits(place), new_count=new_count)
