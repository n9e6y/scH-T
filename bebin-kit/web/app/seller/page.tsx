"use client";
// F15 Seller panel (Bebin Seller and System.dc.html 22a–d). Soil chrome and the apron avatar mark the seller side.
// While open, the shop is in manual mode (presence heartbeat): the simulator stops answering for it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Glasses, Mascot } from "@/components/brand";
import { Check, ChevronForward, Info } from "@/components/icons";
import { modelLine } from "@/components/product-grid-card";
import { api, API_BASE, type InquiryOut, type SellerInboxOut, type SellerShop } from "@/lib/api";
import { distance, faDigits, faNum, parseDigits, relTime, timeFa } from "@/lib/format";

type Item = SellerInboxOut["new"][number];
const KEY = "bebin-seller-shop";

function Chrome({ title, sub, onBack, action }: { title: string; sub: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <header className="flex flex-none items-center gap-3 bg-soil ps-4 pe-3 pt-1 pb-4 text-flesh">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="برگشت" className="flex h-11 w-10 flex-none items-center justify-center">
          <ChevronForward size={22} color="var(--color-flesh)" className="rotate-180" />
        </button>
      )}
      <span className="flex size-[52px] flex-none items-center justify-center overflow-hidden rounded-full bg-flesh"><Mascot pose="apron" scale={2} /></span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[17px] font-bold">{title}</span>
        <span className="truncate text-xs text-leader">{sub}</span>
      </div>
      {action}
    </header>
  );
}

function Picker({ onPick }: { onPick: (s: SellerShop) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<SellerShop | null>(null);
  const shops = useQuery({ queryKey: ["seller-shops", q], queryFn: () => api<SellerShop[]>("/seller/shops", { q }) });
  return (
    <div className="flex h-dvh flex-col">
      <Chrome title="پنل فروشنده" sub="ببین، برای فروشگاه‌ها" />
      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5">
        <h1 className="px-1 text-xl font-extrabold">کدام فروشگاه؟</h1>
        <label className="flex h-12 flex-none items-center gap-2.5 rounded-button border-[1.5px] border-soil bg-card px-3">
          <Glasses width={24} color="var(--color-soil)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام فروشگاه یا پاساژ"
            className="w-0 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-stem" />
        </label>
        <span className="px-1 text-[12.5px] text-stem">{q ? "نتیجه‌ها" : "فروشگاه‌های اخیر"}</span>
        <div role="radiogroup" className="flex-none overflow-hidden rounded-card bg-card">
          {shops.data?.map((s) => {
            const on = sel?.id === s.id;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setSel(s)}
                className={`flex min-h-[60px] w-full items-center gap-3 border-b border-line px-3.5 text-start last:border-b-0 ${on ? "bg-flesh" : ""}`}>
                <span className={`size-[22px] flex-none rounded-full bg-card ${on ? "border-[7px] border-soil" : "border-[1.5px] border-leader"}`} />
                <span className="flex min-w-0 flex-1 flex-col py-2">
                  <span className={`text-[15px] ${on ? "font-bold" : "font-medium"}`}>{s.name}</span>
                  <span className="truncate text-xs text-stem">{s.place}</span>
                </span>
                {s.new_count > 0 && <span className="flex h-6 items-center rounded-full bg-soil px-[9px] text-[11px] font-bold text-flesh">{faNum(s.new_count)} تازه</span>}
              </button>
            );
          })}
          {shops.data && !shops.data.length && <p className="px-3.5 py-4 text-[13px] text-stem">فروشگاهی با این نام نیست.</p>}
          {!shops.data && <div className="flex justify-center py-6"><Glasses width={36} blink /></div>}
        </div>
        <p className="flex items-start gap-2 px-1 text-xs leading-[1.75] text-stem"><Info size={14} className="mt-1 flex-none" />در این نمونه می‌توانی جای هر فروشگاهی جواب بدهی. در نسخه‌ی واقعی، فقط فروشگاه خودت.</p>
      </main>
      <div className="flex-none border-t border-line bg-card px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" disabled={!sel} onClick={() => sel && onPick(sel)}
          className="flex h-[54px] w-full items-center justify-center rounded-button bg-soil text-[15.5px] font-bold text-flesh disabled:bg-line disabled:text-stem">
          {sel ? `ورود به ${sel.name}` : "یک فروشگاه انتخاب کن"}
        </button>
      </div>
    </div>
  );
}

const QUICK = ["سلام، بله موجوده.", "بفرمایید تشریف بیارید.", "متأسفانه تموم شده.", "قیمت کمی تغییر کرده."];

function ReplyForm({ item, shop, onDone, onBack }: { item: Item; shop: SellerShop; onDone: (r: InquiryOut) => void; onBack: () => void }) {
  const inq = item.inquiry;
  const asks = (k: string) => inq.questions.includes(k);
  const [stock, setStock] = useState<"in_stock" | "out_of_stock" | null>(null);
  const [price, setPrice] = useState(item.prefill_price ? faNum(item.prefill_price) : "");
  const [hours, setHours] = useState<string | null>(item.hour_options[1] ?? null);
  const [spot, setSpot] = useState(item.prefill_location ?? "");
  const [inst, setInst] = useState("");
  const [msg, setMsg] = useState("");
  const model = inq.product ? modelLine(inq.product.title, inq.product.model) : null;
  const send = useMutation({
    mutationFn: () => api<InquiryOut>(`/seller/inquiries/${inq.id}/reply`, undefined, {
      method: "POST",
      body: JSON.stringify({
        stock: asks("stock") || asks("has_model") ? stock : null, stock_detail: inq.detail,
        price: asks("price") && stock !== "out_of_stock" ? parseDigits(price) : null,
        hours_today: asks("hours") && hours ? `تا ${faDigits(hours)} باز است` : null,
        location: asks("location") ? spot.trim() || null : null, installments: asks("installments") ? inst.trim() || null : null,
        hold: asks("hold") && stock === "in_stock" && inq.hold_until ? `تا ${faDigits(inq.hold_until)} نگه می‌داریم` : null,
        message: msg.trim() || null,
      }),
    }),
    onSuccess: onDone,
  });
  const needStock = asks("stock") || asks("has_model");
  const ok = !needStock || stock != null;
  const opt = (on: boolean, kind: "yes" | "no") =>
    `flex h-[52px] items-center justify-center gap-1.5 rounded-button border-2 text-base font-bold ${on
      ? kind === "yes" ? "border-stamp-ink bg-stamp-tint text-stamp" : "border-beet bg-beet-tint text-beet"
      : "border-line bg-card"}`;
  return (
    <div className="flex h-dvh flex-col">
      <Chrome title={`پاسخ به ${inq.buyer}`} sub={[model ?? inq.product?.title, inq.detail && faDigits(inq.detail), shop.name].filter(Boolean).join("، ")} onBack={onBack} />
      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3.5 pb-5">
        <div className="flex flex-none flex-col gap-1 rounded-card bg-card px-3.5 py-3">
          <span className="text-[11.5px] text-stem">{inq.buyer} می‌پرسد، {timeFa(inq.created_at)}</span>
          <span className="text-sm leading-[1.85]">{inq.ask_text}</span>
        </div>
        {needStock && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{inq.detail ? `${faDigits(inq.detail)} موجود است؟` : "موجود است؟"}</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={stock === "in_stock"} onClick={() => setStock("in_stock")} className={opt(stock === "in_stock", "yes")}>موجود است</button>
              <button type="button" aria-pressed={stock === "out_of_stock"} onClick={() => setStock("out_of_stock")} className={opt(stock === "out_of_stock", "no")}>ناموجود</button>
            </div>
          </section>
        )}
        {asks("price") && stock !== "out_of_stock" && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-bold">قیمت امروز</h2>
            <label className="flex h-[52px] items-center gap-2 rounded-button border-[1.5px] border-soil bg-card px-3.5">
              <input value={price} onChange={(e) => { const n = parseDigits(e.target.value); setPrice(n ? faNum(n) : ""); }} inputMode="numeric"
                className="tabular w-0 min-w-0 flex-1 bg-transparent text-lg font-extrabold outline-none" aria-label="قیمت امروز" />
              <span className="text-xs text-stem">تومان</span>
            </label>
            {item.prefill_price && <span className="text-[11.5px] text-stem">قیمت ثبت‌شده‌ی شما: {faNum(item.prefill_price)}؛ اگر فرق دارد عوضش کنید.</span>}
          </section>
        )}
        {asks("hours") && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">امروز تا ساعت</h2>
            <div className="flex flex-wrap gap-2">
              {item.hour_options.map((h) => (
                <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}
                  className={`hit flex h-10 items-center rounded-full border-[1.5px] px-4 text-sm ${hours === h ? "border-soil bg-soil font-bold text-flesh" : "border-line bg-card"}`}>
                  {faDigits(h)}
                </button>
              ))}
            </div>
          </section>
        )}
        {asks("location") && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-bold">جای دقیق</h2>
            <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="مثلاً طبقه دوم، روبه‌روی پله‌برقی"
              className="h-12 rounded-button border-[1.5px] border-line bg-card px-3.5 text-[14.5px] outline-none placeholder:text-stem" />
          </section>
        )}
        {asks("installments") && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-bold">شرایط اقساط</h2>
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="مثلاً با چک، ۶ ماهه"
              className="h-12 rounded-button border-[1.5px] border-line bg-card px-3.5 text-[14.5px] outline-none placeholder:text-stem" />
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">پیام</h2>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((t) => (
              <button key={t} type="button" onClick={() => setMsg((m) => (m ? `${m} ${t}` : t))}
                className="hit flex h-[34px] items-center rounded-full border-[1.5px] border-line bg-card px-3 text-[12.5px] hover:border-soil">{t}</button>
            ))}
          </div>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={400}
            className="resize-none rounded-button border-[1.5px] border-line bg-card px-3.5 py-2.5 text-sm leading-[1.8] outline-none" />
        </section>
        {send.isError && <p className="text-[13px] text-beet">ارسال نشد؛ دوباره امتحان کنید.</p>}
      </main>
      <div className="flex flex-none flex-col gap-2 border-t border-line bg-card px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <span className="text-center text-[11.5px] text-stem">{inq.buyer} این پاسخ را با مهر «تأیید فروشنده» و ساعت ارسال می‌بیند.</span>
        <button type="button" disabled={!ok || send.isPending} onClick={() => send.mutate()}
          className="flex h-14 items-center justify-center gap-2.5 rounded-button bg-stamp text-[16.5px] font-bold text-white disabled:bg-line disabled:text-stem">
          {send.isPending ? <Glasses width={30} color="#FFFFFF" blink /> : <>
            <span className="flex size-7 -rotate-6 items-center justify-center rounded-full border-[1.5px] border-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/stamp-radish-mini.svg" width={9} height={9} alt="" className="pixelated brightness-0 invert" />
            </span>{ok ? "ارسال پاسخ" : "موجودی را مشخص کنید"}</>}
        </button>
      </div>
    </div>
  );
}

function Sent({ r, onNext }: { r: InquiryOut; onNext: () => void }) {
  return (
    <div className="flex h-dvh flex-col">
      <Chrome title={`پاسخ به ${r.buyer}`} sub={r.shop.name} />
      <main className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-[18px] overflow-y-auto px-4 pt-6 pb-5">
        <div className="relative size-[176px] flex-none">
          <span className="absolute inset-0 animate-ink-ring rounded-full border-[3px] border-stamp-ink" aria-hidden />
          <div className="absolute inset-0 flex animate-stamp items-center justify-center rounded-full border-4 border-stamp-ink bg-card">
            <div className="flex size-[154px] flex-col items-center justify-center gap-[5px] rounded-full border-[1.5px] border-stamp-ink text-stamp">
              <span className="text-[13px] font-extrabold">تأیید فروشنده</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/stamp-radish-mini.svg" width={36} height={36} alt="" className="pixelated" />
              <span className="text-[22px] leading-tight font-extrabold">{r.answered_at ? timeFa(r.answered_at) : ""}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[19px] font-bold">پاسخ شما ثبت شد</span>
          <span className="text-[13px] leading-[1.8] text-stem [text-wrap:pretty]">{r.buyer} همین حالا می‌بیند. این اطلاعات تا پایان امروز با مهر شما نمایش داده می‌شود.</span>
        </div>
        <div className="w-full flex-none overflow-hidden rounded-card bg-card">
          {r.answers.filter((a) => a.value).map((a) => (
            <div key={a.key} className="flex items-center gap-2 border-b border-line bg-stamp-row px-3.5 py-[11px] text-[13px] last:border-b-0">
              <span className="whitespace-nowrap text-stem">{a.label}</span>
              <span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-stamp-leader" />
              <span className={`text-end font-bold ${a.value === "ناموجود" ? "text-beet" : "text-stamp"}`}>{faDigits(a.value!)}</span>
            </div>
          ))}
        </div>
        <span className="w-full text-[11.5px] leading-[1.7] text-stem">اگر قیمت تغییر کرد، قیمت ثبت‌شده‌تان را هم به‌روز کنید تا خریدارهای بعدی «قیمت قدیمی» نبینند.</span>
      </main>
      <div className="flex-none border-t border-line bg-card px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onNext} className="flex h-[50px] w-full items-center justify-center rounded-button bg-soil text-[14.5px] font-bold text-flesh">پیام بعدی</button>
      </div>
    </div>
  );
}

function Inbox({ shop, onChange }: { shop: SellerShop; onChange: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Item | null>(null);
  const [sent, setSent] = useState<InquiryOut | null>(null);
  const [tab, setTab] = useState<"new" | "answered">("new");
  const inbox = useQuery({ queryKey: ["seller-inbox", shop.id], queryFn: () => api<SellerInboxOut>("/seller/inbox", { shop_id: shop.id }) });
  // Live: new inquiries for this shop arrive over SSE; the connection also keeps the shop in manual mode.
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/seller/events?shop_id=${encodeURIComponent(shop.id)}`);
    const refresh = () => qc.invalidateQueries({ queryKey: ["seller-inbox", shop.id] });
    for (const t of ["created", "delivered", "cancelled", "replay"]) es.addEventListener(t, refresh);
    const beat = setInterval(() => api("/seller/presence", { shop_id: shop.id }, { method: "POST" }).catch(() => {}), 20_000);
    return () => { es.close(); clearInterval(beat); };
  }, [shop.id, qc]);

  if (sent) return <Sent r={sent} onNext={() => { setSent(null); setOpen(null); qc.invalidateQueries({ queryKey: ["seller-inbox", shop.id] }); }} />;
  if (open) return <ReplyForm item={open} shop={shop} onBack={() => setOpen(null)} onDone={setSent} />;
  const d = inbox.data;
  return (
    <div className="flex h-dvh flex-col">
      <Chrome title={shop.name} sub={`پنل فروشنده، ${shop.place}`}
        action={<button type="button" onClick={onChange} className="hit px-0.5 py-2 text-[13px] font-bold text-radish-night">تغییر</button>} />
      <div className="flex flex-none gap-1.5 px-4 pt-3.5 pb-1.5">
        {([["new", "تازه", d?.new.length ?? 0], ["answered", "پاسخ‌داده", d?.answered.length ?? 0]] as const).map(([k, l, n]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] ${tab === k ? "bg-soil font-bold text-flesh" : "border-[1.5px] border-line bg-card"}`}>
            {l}<span className={`text-[11.5px] ${tab === k ? "text-leader" : "text-stem"}`}>{faNum(n)}</span>
          </button>
        ))}
      </div>
      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2.5 pb-6">
        {!d && <div className="flex justify-center py-10"><Glasses width={44} color="var(--color-soil)" blink /></div>}
        {d && tab === "new" && !d.new.length && (
          <div className="flex flex-col items-center gap-2 py-10 text-center"><Mascot pose="apron" scale={3} />
            <p className="text-[13.5px] text-stem">پیام تازه‌ای نیست. وقتی خریداری بپرسد، همین‌جا می‌آید.</p></div>
        )}
        {d && tab === "new" && d.new.map((it) => {
          const inq = it.inquiry;
          const model = inq.product ? modelLine(inq.product.title, inq.product.model) : null;
          return (
            <button key={inq.id} type="button" onClick={() => setOpen(it)}
              className="flex flex-none flex-col gap-2.5 rounded-card border-[1.5px] border-soil bg-card p-3.5 text-start">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-radish" />
                <span className="text-[15px] font-bold">{inq.buyer}</span>
                {inq.buyer_distance_m != null && <span className="text-xs text-stem">حدود {distance(inq.buyer_distance_m)} از شما</span>}
                <span className="flex-1" />
                <span className="text-[11.5px] text-stem">{timeFa(inq.created_at)}</span>
              </div>
              <div className="flex flex-col">
                {model ? <bdi dir="ltr" className="block text-start text-sm font-bold">{model}</bdi> : <span className="text-sm font-bold">{inq.product?.title ?? "پیام عمومی"}</span>}
                {inq.detail && <span className="text-xs text-stem">{faDigits(inq.detail)}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inq.questions.map((qk) => (
                  <span key={qk} className="flex h-7 items-center rounded-full border border-line bg-flesh px-2.5 text-xs">
                    {{ price: "قیمت امروز", stock: "موجودی", has_model: "این مدل را دارید؟", hours: "ساعت کاری", location: "جای دقیق", installments: "اقساط", hold: "نگه داشتن" }[qk] ?? qk}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-line pt-2">
                <Check size={14} color="var(--color-stem)" />
                <span className="flex-1 text-xs text-stem">زود جواب بدهید تا خریدار سراغ فروشگاه دیگری نرود.</span>
                <span className="text-[13px] font-bold text-radish">جواب بده</span>
              </div>
            </button>
          );
        })}
        {d && tab === "answered" && (
          <div className="flex-none overflow-hidden rounded-card bg-card">
            {d.answered.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 border-b border-line px-3.5 py-3 last:border-b-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{a.buyer}، {a.product ? (modelLine(a.product.title, a.product.model) ?? a.product.title) : "پیام عمومی"}</span>
                  <span className="text-[11.5px] text-stem">{a.preview}</span>
                </div>
                <span className="text-[11.5px] whitespace-nowrap text-stem">{a.answered_at ? relTime(a.answered_at) : ""}</span>
              </div>
            ))}
            {!d.answered.length && <p className="px-3.5 py-4 text-[13px] text-stem">هنوز به پیامی جواب نداده‌اید.</p>}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SellerPage() {
  const [shop, setShop] = useState<SellerShop | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
  });
  const pick = (s: SellerShop | null) => {
    setShop(s);
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch {}
  };
  return shop ? <Inbox key={shop.id} shop={shop} onChange={() => pick(null)} /> : <Picker onPick={pick} />;
}
