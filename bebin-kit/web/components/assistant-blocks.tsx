"use client";
// Assistant UI blocks (Bebin Assistant.dc.html 21a–d). Same trust visuals as the screens: listed vs verified,
// dashed unknowns, stamp only for seller answers. Actions work inside chat (ask, compare, plan).
import { useMutation, useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type InquiryOut, type S } from "@/lib/api";
import { appendStatus, markAnswered, send, type Block } from "@/lib/chat";
import { distance, faDigits, faNum, timeFa, tomanRange } from "@/lib/format";
import { directionsUrl, placeLine } from "@/lib/place";
import { useApp } from "@/lib/store";
import { Glasses, MiniStamp } from "./brand";
import { useToasts } from "./chrome";
import { Check, ChevronForward, Hourglass } from "./icons";
import { ImageBox, modelLine } from "./product-grid-card";
import { OpenStatusPill, PaymentBadges, Unknown } from "./trust";

const card = "flex-none overflow-hidden rounded-card bg-card";
const head = "flex items-baseline justify-between gap-2 border-b border-line px-3.5 py-2.5";

function ProductList({ b }: { b: Extract<Block, { type: "product_list" }> }) {
  return (
    <div className={card}>
      <div className={head}><span className="text-[13px] font-bold">{b.title}</span><span className="text-[11.5px] text-stem">قیمت ثبت‌شده</span></div>
      {b.items.map((p) => {
        const model = modelLine(p.title, p.model);
        const range = tomanRange(p.price_range.min, p.price_range.max);
        const near = distance(p.nearest_distance_m);
        return (
          <Link key={p.id} href={`/product/${p.id}`} className="flex items-start gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
            <ImageBox src={p.image} className="size-[52px] flex-none rounded-[10px] p-0.5" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {model ? <bdi dir="ltr" className="block truncate text-start text-sm font-bold">{model}</bdi> : null}
              <span className={`line-clamp-2 ${model ? "text-xs text-stem" : "text-[13px] font-bold"}`}>{p.title}</span>
              {range ? <span className="tabular text-[13px] font-extrabold">{range} <span className="text-[11px] font-medium">تومان</span></span>
                : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
              <span className="text-[11.5px] text-stem">{faNum(p.seller_count)} فروشنده{near ? `، نزدیک‌ترین ${near}` : ""}</span>
              {!b.plain && !!p.reasons?.length && (
                <span className="mt-0.5 text-xs leading-[1.7]"><b className="font-bold text-radish">چرا این؟</b> {faDigits(p.reasons.join("، "))}</span>
              )}
            </div>
            <ChevronForward size={16} color="var(--color-stem)" className="mt-4" />
          </Link>
        );
      })}
      {b.query && (
        <Link href={`/search?${b.search ?? `q=${encodeURIComponent(b.query)}`}`} className="flex h-11 items-center justify-center text-[13px] font-semibold text-radish">
          {b.total > b.items.length ? `همه‌ی ${faNum(b.total)} نتیجه در جست‌وجو` : "در جست‌وجو ببین"}
        </Link>
      )}
    </div>
  );
}

function SellerList({ b }: { b: Extract<Block, { type: "seller_list" }> }) {
  const model = modelLine(b.product.title, b.product.model);
  return (
    <div className={card}>
      <div className={head}>
        <span className="truncate text-[13px] font-bold">فروشنده‌های {model ? <bdi>{model}</bdi> : b.product.title}</span>
        <span className="text-[11.5px] whitespace-nowrap text-stem">ترتیب: {b.mode_label}</span>
      </div>
      {b.rows.map((r) => {
        const verified = r.price.kind === "verified";
        const stale = r.price.freshness === "stale";
        return (
          <Link key={r.shop.id} href={`/shop/${r.shop.id}`} className={`flex flex-col gap-1.5 border-b border-line px-3.5 py-[11px] ${verified ? "bg-stamp-row" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{r.shop.name}</span>
              <span className={`mb-[7px] min-w-3 flex-1 self-end border-b-[1.5px] border-dotted ${verified ? "border-stamp-leader" : "border-leader"}`} />
              {verified && <MiniStamp size={24} />}
              {r.price.value ? (
                <span className={`tabular text-sm whitespace-nowrap ${verified ? "font-extrabold text-stamp" : stale ? "font-semibold text-faded" : "font-extrabold"}`}>
                  {faNum(r.price.value)} <span className="text-[10.5px] font-medium">تومان</span>
                </span>
              ) : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.distance_m != null && <span className="me-0.5 text-[11.5px] text-stem">{distance(r.distance_m)}</span>}
              <OpenStatusPill status={r.open_now} size="sm" />
              {stale && <span className="inline-flex h-6 items-center rounded-full bg-wilt-tint px-2 text-[11px] font-semibold text-wilt">قیمت قدیمی</span>}
              {r.stock.state === "unknown" ? <Unknown size="sm">موجودی</Unknown>
                : r.stock.state === "in_stock" ? <span className="text-[11.5px] font-bold text-stamp">موجود است</span>
                  : <span className="text-[11.5px] font-bold text-beet">ناموجود</span>}
            </div>
          </Link>
        );
      })}
      <Link href={`/product/${b.product.id}/sellers`} className="flex h-[42px] items-center justify-center text-[13px] font-semibold text-radish">
        همه‌ی {faNum(b.total)} فروشنده
      </Link>
    </div>
  );
}

function Question({ b, msgId, answered, last }: { b: Extract<Block, { type: "question_chips" }>; msgId: string; answered?: string; last: boolean }) {
  const locked = !!answered || !last;
  return (
    <div className="flex flex-none flex-col gap-2.5">
      <span className="text-[14.5px] leading-[1.85]">{b.question}</span>
      <div className="flex flex-wrap gap-2">
        {b.options.map((o) => {
          const on = answered === o;
          return (
            <button key={o} type="button" disabled={locked} aria-pressed={on}
              onClick={() => { markAnswered(msgId, o); send(o); }}
              className={`hit flex h-[38px] items-center rounded-full border-[1.5px] px-4 text-[13.5px] ${on ? "border-radish bg-radish-tint font-bold" : "border-line bg-card font-medium"} ${locked && !on ? "text-stem" : ""}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InquiryConfirm({ b, last }: { b: Extract<Block, { type: "inquiry_confirm" }>; last: boolean }) {
  const loc = useApp((s) => s.location);
  const [done, setDone] = useState(false);
  const ask = useMutation({
    mutationFn: () => api<InquiryOut[]>("/inquiries", undefined, { method: "POST", body: JSON.stringify({
      shop_ids: b.shops.map((s) => s.id), product_id: b.product?.id ?? null, questions: b.questions, detail: b.detail ?? null,
      lat: loc?.lat, lng: loc?.lng }) }),
    onSuccess: (out) => { setDone(true); appendStatus(out.map((o) => o.id)); },
  });
  const n = b.shops.length;
  return (
    <div className="flex flex-none flex-col gap-2.5 rounded-card border-[1.5px] border-line bg-card p-3.5">
      <span className="text-[15px] font-bold">{n > 1 ? `از ${faNum(n)} فروشنده بپرسم؟` : `از ${b.shops[0]?.name} بپرسم؟`}</span>
      <span className="text-[12.5px] leading-[1.75] text-stem">{faDigits(b.summary)}</span>
      {done ? <span className="flex items-center gap-1.5 text-[13px] font-semibold text-stem"><Check size={14} />فرستاده شد</span>
        : last && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" onClick={() => ask.mutate()} disabled={ask.isPending}
              className="flex h-[46px] items-center justify-center rounded-button bg-radish text-[15px] font-bold text-white">
              {ask.isPending ? <Glasses width={28} color="#FFFFFF" blink /> : "بپرس"}
            </button>
            <button type="button" onClick={() => send("نه فعلاً")} className="flex h-[46px] items-center rounded-button border-[1.5px] border-line px-4 text-sm font-semibold">نه فعلاً</button>
          </div>
        )}
      {ask.isError && <span className="text-[13px] text-beet">نرفت؛ دوباره بزن.</span>}
    </div>
  );
}

function InquiryStatus({ b }: { b: Extract<Block, { type: "inquiry_status" }> }) {
  const qs = useQueries({ queries: b.ids.map((id) => ({ queryKey: ["inquiry", id], queryFn: () => api<InquiryOut>(`/inquiries/${id}`) })) });
  const rows = qs.map((q) => q.data).filter(Boolean) as InquiryOut[];
  const doneN = rows.filter((r) => r.outcome !== "waiting").length;
  return (
    <div className={card}>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="flex-1 text-[13px] font-bold">پرسیدم، {timeFa(b.at)}</span>
        {doneN < b.ids.length && <Glasses width={24} blink />}
        <span className="text-[11.5px] text-stem">{faNum(doneN)} از {faNum(b.ids.length)} نتیجه</span>
      </div>
      {rows.map((r) => (
        <Link key={r.id} href={`/inquiries/${r.id}`} className={`flex items-center gap-2 border-b border-line px-3.5 py-[11px] ${r.outcome === "answered" ? "bg-stamp-row" : ""}`}>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[13.5px] font-bold">{r.shop.name}</span>
            {r.outcome !== "waiting" && (
              <span className={`text-xs font-semibold ${r.outcome === "answered" ? "text-stamp" : r.outcome === "out_of_stock" ? "text-beet" : "text-wilt"}`}>
                {r.outcome === "no_answer" ? r.failure_note ?? r.preview : `${r.preview}${r.answered_at ? `، ${timeFa(r.answered_at)}` : ""}`}
              </span>
            )}
          </div>
          {r.outcome === "answered" ? <MiniStamp size={28} />
            : r.outcome === "no_answer" ? <span className="inline-flex h-6 items-center gap-1 rounded-full bg-wilt-tint px-2 text-[11px] font-semibold text-wilt"><Hourglass size={11} />جواب نداد</span>
              : r.outcome === "out_of_stock" ? <span className="inline-flex h-6 items-center rounded-full bg-beet-tint px-2 text-[11px] font-semibold text-beet">ناموجود</span>
                : <span className="inline-flex h-6 items-center rounded-full border border-leader px-2 text-[11px] font-semibold">{r.status === "seen" ? "دیده شد" : "ارسال شد"}</span>}
        </Link>
      ))}
      <Link href="/inquiries" className="flex h-10 items-center justify-center text-[12.5px] font-semibold text-radish">در «پیگیری‌ها» ببین</Link>
    </div>
  );
}

function Compare({ b }: { b: Extract<Block, { type: "compare" }> }) {
  return (
    <div className={card}>
      <div className={head}><span className="text-[13px] font-bold">مقایسه</span><span className="text-[11.5px] text-stem">قیمت‌ها: ثبت‌شده</span></div>
      {b.rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-1 border-b border-line px-3.5 py-2.5">
          <span className="text-[11.5px] text-stem">{r.key}</span>
          {b.columns.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="max-w-[45%] truncate text-stem">{modelLine(c.title, c.model) ?? c.title}</span>
              <span className="mb-1 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
              {r.leader === i && <span className="size-[7px] rounded-full bg-soil" />}
              <span className={r.leader === i ? "font-bold" : ""}>{r.values[i] ? faDigits(r.values[i]!) : <Unknown size="sm">نامشخص</Unknown>}</span>
            </div>
          ))}
        </div>
      ))}
      <Link href={`/compare?ids=${b.ids.join(",")}`} className="flex h-[42px] items-center justify-center text-[13px] font-semibold text-radish">مقایسه‌ی کامل</Link>
    </div>
  );
}

function ShopCard({ b }: { b: Extract<Block, { type: "shop_card" }> }) {
  return (
    <div className="flex flex-none flex-col gap-2 rounded-card bg-card p-3.5">
      <div className="flex items-center gap-2"><Link href={`/shop/${b.shop.id}`} className="text-[15px] font-bold">{b.shop.name}</Link></div>
      <span className="text-xs text-stem">{placeLine(b.shop)}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <OpenStatusPill status={b.open_now} size="sm" />
        {b.hours_today && <span className="text-xs text-stem">امروز: {b.hours_today.replace(/–/g, " تا ")}</span>}
      </div>
      <PaymentBadges payment={b.payment} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <a href={directionsUrl(b.shop.lat, b.shop.lng)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center rounded-button border-[1.5px] border-radish text-[13px] font-bold text-radish">مسیر</a>
        <Link href={`/shop/${b.shop.id}`} className="flex h-11 items-center justify-center rounded-button border-[1.5px] border-line text-[13px] font-semibold">صفحه‌ی فروشگاه</Link>
      </div>
    </div>
  );
}

function PlanConfirm({ b, last }: { b: Extract<Block, { type: "plan_confirm" }>; last: boolean }) {
  const togglePlan = useApp((s) => s.togglePlan);
  const plan = useApp((s) => s.plan);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const all = b.shops.every((s) => plan.some((p) => p.shopId === s.id));
  const add = () => {
    b.shops.forEach((s) => {
      if (!plan.some((p) => p.shopId === s.id)) {
        togglePlan({ shopId: s.id, shopName: s.name, lat: s.lat ?? 0, lng: s.lng ?? 0, mallId: s.mall_id ?? null,
          productId: b.product?.id ?? null, productTitle: b.product?.title ?? null });
      }
    });
    push({ text: "به برنامه اضافه شد", icon: <Check size={16} color="var(--color-radish-night)" />, action: { label: "ببین", onClick: () => router.push("/plan") } });
  };
  return (
    <div className="flex flex-none flex-col gap-2.5 rounded-card border-[1.5px] border-line bg-card p-3.5">
      <span className="text-[15px] font-bold">به برنامه اضافه کنم؟</span>
      <span className="text-[12.5px] leading-[1.75] text-stem">{b.summary}</span>
      {all ? <span className="flex items-center gap-1.5 text-[13px] font-semibold text-stem"><Check size={14} />در برنامه</span> : last && (
        <div className="flex gap-2">
          <button type="button" onClick={add} className="flex h-11 items-center rounded-button bg-radish px-4 text-[13.5px] font-bold text-white">به برنامه اضافه کن</button>
          <button type="button" onClick={() => send("نه فعلاً")} className="flex h-11 items-center rounded-button border-[1.5px] border-line px-4 text-[13.5px] font-semibold">نه فعلاً</button>
        </div>
      )}
    </div>
  );
}

function Notice({ b, retry }: { b: Extract<Block, { type: "notice" }>; retry?: () => void }) {
  return (
    <div className={`flex flex-none items-start gap-2 rounded-button px-3 py-2.5 ${b.level === "wilt" ? "bg-wilt-tint" : "bg-card"}`}>
      {b.level === "wilt" && <Hourglass size={15} color="var(--color-wilt)" className="mt-1" />}
      <span className={`flex-1 text-[13px] leading-[1.75] font-semibold ${b.level === "wilt" ? "text-wilt" : ""}`}>{b.text}</span>
      {retry && <button type="button" onClick={retry} className="hit pt-0.5 text-[12.5px] font-bold whitespace-nowrap text-radish">دوباره</button>}
    </div>
  );
}

export function BlockView({ b, msgId, answered, last, retry }:
  { b: Block; msgId: string; answered?: string; last: boolean; retry?: () => void }) {
  switch (b.type) {
    case "product_list": return <ProductList b={b} />;
    case "seller_list": return <SellerList b={b} />;
    case "question_chips": return <Question b={b} msgId={msgId} answered={answered} last={last} />;
    case "inquiry_confirm": return <InquiryConfirm b={b} last={last} />;
    case "inquiry_status": return <InquiryStatus b={b} />;
    case "compare": return <Compare b={b} />;
    case "shop_card": return <ShopCard b={b} />;
    case "plan_confirm": return <PlanConfirm b={b} last={last} />;
    case "notice": return <Notice b={b} retry={retry} />;
    default: return null;
  }
}

export type { S };
