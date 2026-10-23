"use client";
// Inquiry pieces (Bebin Inquiry.dc.html): status chip, timeline, answer receipt, stamp moment, alternatives card.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type AlternativesOut, type InquiryOut } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { faDigits, timeFa } from "@/lib/format";
import { directionsUrl } from "@/lib/place";
import { useApp } from "@/lib/store";
import { Glasses, Mascot, MiniStamp } from "./brand";
import { Check, Cross, Hourglass } from "./icons";
import { SimulatedLabel } from "./trust";

export function StatusChip({ inq }: { inq: InquiryOut }) {
  const base = "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap";
  switch (inq.outcome) {
    case "answered":
      return <span className={`${base} border border-stamp-ink bg-stamp-tint ps-1 font-bold text-stamp`}><MiniStamp size={20} />جواب داد</span>;
    case "out_of_stock":
      return <span className={`${base} bg-beet-tint text-beet`}><Cross size={11} />ناموجود</span>;
    case "no_answer":
      return <span className={`${base} bg-wilt-tint text-wilt`}><Hourglass size={11} />جواب نداد</span>;
    case "cancelled":
      return <span className={`${base} border border-leader text-stem`}>لغو شد</span>;
    default:
      return inq.status === "seen"
        ? <span className={`${base} border border-leader`}><Check size={11} />دیده شد</span>
        : <span className={`${base} border border-leader text-stem`}><Check size={11} />ارسال شد</span>;
  }
}

/** Horizontal timeline: ارسال شد → تحویل شد → دیده شد → جواب داد. */
export function Timeline({ inq }: { inq: InquiryOut }) {
  return (
    <ol className="relative flex px-1" aria-label="وضعیت پیام">
      <span className="absolute inset-x-[12%] top-2.5 h-0.5 bg-line" aria-hidden />
      {inq.steps.map((s) => {
        const color = { done: "text-soil", answered: "text-stamp", failed: "text-wilt", out: "text-beet", waiting: "text-radish", pending: "text-stem" }[s.state];
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-card px-[3px]">
              {s.state === "done" && <span className="flex size-3.5 items-center justify-center rounded-full bg-soil"><Check size={9} color="#FFFFFF" sw={3.5} /></span>}
              {s.state === "answered" && <span className="rounded-full bg-card"><MiniStamp size={20} /></span>}
              {s.state === "failed" && <span className="flex size-5 items-center justify-center rounded-full bg-wilt-tint"><Hourglass size={11} color="var(--color-wilt)" /></span>}
              {s.state === "out" && <span className="flex size-5 items-center justify-center rounded-full bg-beet-tint"><Cross size={11} color="var(--color-beet)" /></span>}
              {s.state === "waiting" && <Glasses width={22} blink />}
              {s.state === "pending" && <span className="size-3.5 rounded-full border-[1.5px] border-dashed border-ash" />}
            </span>
            <span className={`text-center text-[11px] leading-normal ${color} ${s.state === "done" ? "font-medium" : "font-bold"}`}>{s.label}</span>
            {s.at && <span className="text-[10.5px] text-stem">{s.at}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function AskedBubble({ inq }: { inq: InquiryOut }) {
  return (
    <div className="flex max-w-[84%] flex-none flex-col gap-1 self-end rounded-[16px_16px_16px_4px] bg-radish-tint px-3.5 py-2.5">
      <span className="text-[11px] text-stem">سؤال‌های تو، {timeFa(inq.created_at)}</span>
      <span className="text-[13.5px] leading-[1.8]">{inq.ask_text}</span>
    </div>
  );
}

export function SellerBubble({ inq }: { inq: InquiryOut }) {
  if (!inq.message) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-w-[88%] flex-col gap-1 self-start rounded-[16px_16px_4px_16px] border border-line bg-flesh px-3.5 py-2.5">
        <span className="text-[11px] text-stem">{inq.shop.name}{inq.answered_at ? `، ${timeFa(inq.answered_at)}` : ""}</span>
        <span className="text-[13.5px] leading-[1.85]">{inq.message}</span>
      </div>
      {inq.simulated && <SimulatedLabel />}
    </div>
  );
}

/** 17c: each answer carries its own verified mark; a skipped question stays dashed. */
export function AnswerCard({ inq }: { inq: InquiryOut }) {
  return (
    <div className="flex-none overflow-hidden rounded-card bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <span className="flex-1 text-[14.5px] font-bold">پاسخ فروشنده</span>
        {inq.answered_at && <span className="text-xs font-semibold text-stamp">{timeFa(inq.answered_at)}</span>}
      </div>
      {inq.answers.map((a) => (
        <div key={a.key} className={`flex flex-col gap-0.5 border-b border-line px-3.5 py-[11px] ${a.value ? "bg-stamp-row" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] whitespace-nowrap text-stem">{a.label}</span>
            <span className={`mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted ${a.value ? "border-stamp-leader" : "border-leader"}`} />
            {a.value ? (
              <>
                <span className={`text-end text-[13.5px] font-bold ${a.value === "ناموجود" ? "text-beet" : "text-stamp"}`}>{faDigits(a.value)}</span>
                {a.value !== "ناموجود" && (
                  <span className="flex size-[18px] flex-none items-center justify-center rounded-full border-[1.5px] border-stamp-ink"><Check size={10} color="var(--color-stamp)" sw={3.4} /></span>
                )}
              </>
            ) : (
              <span className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-dashed border-ash px-[9px] text-[11.5px] text-stem"><b>؟</b>جواب نداد</span>
            )}
          </div>
          {a.sub && <span className="self-end text-[11.5px] text-stem">{a.sub}</span>}
        </div>
      ))}
      <div className="px-3.5 py-3"><SellerBubble inq={inq} /></div>
    </div>
  );
}

/** 17b: the one mascot moment in the flow. The stamp lands (220ms) and the ink ring spreads. */
export function StampMoment({ inq }: { inq: InquiryOut }) {
  const at = inq.answered_at ? timeFa(inq.answered_at) : "";
  const what = inq.answers.filter((a) => a.value).map((a) => a.label.replace("امروز", "").trim()).join("، ");
  return (
    <div className="flex flex-col items-center gap-[18px] py-2">
      <div className="relative flex items-end justify-center">
        <div className="relative size-[176px] flex-none">
          <span className="absolute inset-0 animate-ink-ring rounded-full border-[3px] border-stamp-ink" aria-hidden />
          <div className="absolute inset-0 flex animate-stamp items-center justify-center rounded-full border-4 border-stamp-ink bg-card">
            <div className="flex size-[154px] flex-col items-center justify-center gap-[5px] rounded-full border-[1.5px] border-stamp-ink text-stamp">
              <span className="text-[13px] font-extrabold">تأیید فروشنده</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/stamp-radish-mini.svg" width={36} height={36} alt="" className="pixelated" />
              <span className="text-[22px] leading-tight font-extrabold">{at}</span>
              <span className="text-[10.5px] font-semibold">{inq.shop.name}</span>
            </div>
          </div>
        </div>
        <Mascot pose="happy" scale={3} className="-mb-1.5 -ms-[18px]" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-lg font-bold">فروشنده تأیید کرد</span>
        <span className="text-[13px] leading-[1.8] text-stem">{what}{what ? "، " : ""}ساعت {at}</span>
      </div>
    </div>
  );
}

/** 18a/b: alternatives are a fresh start: white, soil, radish; the first item is filled. No beet carried over. */
export function Alternatives({ inq }: { inq: InquiryOut }) {
  const loc = useApp((s) => s.location);
  const openComposer = useComposer((s) => s.open);
  const q = useQuery({
    queryKey: ["alternatives", inq.product?.id, inq.shop.id, loc?.lat],
    queryFn: () => api<AlternativesOut>("/alternatives", { product_id: inq.product!.id, failed: [inq.shop.id], lat: loc?.lat, lng: loc?.lng }),
    enabled: !!inq.product,
  });
  if (!inq.product) return null;
  if (!q.data) return <div className="flex h-40 flex-none items-center justify-center rounded-card bg-card"><Glasses width={40} blink /></div>;
  return (
    <div className="flex flex-none flex-col gap-1 rounded-card bg-card px-4 pt-4 pb-1.5">
      <span className="text-base font-bold">به جایش این‌ها را ببین</span>
      <span className="text-xs leading-[1.7] text-stem">{q.data.note ?? "از نزدیک‌ترین راه حل به دورترین."}</span>
      {q.data.tiers.map((t) => (
        <div key={t.key} className="flex flex-col pt-3">
          <span className="pb-0.5 text-xs font-bold text-stem">{t.title}</span>
          {t.items.map((i) => {
            const cls = `flex h-[38px] flex-none items-center rounded-button border-[1.5px] border-radish px-3 text-[12.5px] font-bold whitespace-nowrap ${i.primary ? "bg-radish text-white" : "bg-card text-radish"}`;
            return (
              <div key={`${i.shop_id}-${i.product_id}`} className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0">
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="line-clamp-2 text-sm leading-[1.6] font-bold">{i.kind === "shop" ? i.title : i.title}</span>
                  <span className="text-xs leading-[1.7] text-stem [text-wrap:pretty]">{faDigits(i.reason)}</span>
                </div>
                {i.action === "route" && i.lat != null ? (
                  <a href={directionsUrl(i.lat, i.lng!)} target="_blank" rel="noopener" className={cls}>{i.action_label}</a>
                ) : i.action === "ask" && i.shop_id ? (
                  <button type="button" className={cls} onClick={() => openComposer({ productId: inq.product!.id, productTitle: inq.product!.title,
                    shops: [{ id: i.shop_id!, name: i.shop_name ?? i.title }], preset: t.key === "related" ? ["has_model"] : [] })}>{i.action_label}</button>
                ) : (
                  <Link href={`/product/${i.product_id}`} className={cls}>{i.action_label}</Link>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
