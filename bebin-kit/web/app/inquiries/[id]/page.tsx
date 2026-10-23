"use client";
// F10 Thread (Bebin Inquiry.dc.html 17a–c, 18a–b): header + timeline; asked bubble; waiting card, stamp moment,
// structured answers + seller bubble; failures lead into the alternatives card; sticky next actions.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Glasses } from "@/components/brand";
import { BottomNav, useToasts } from "@/components/chrome";
import { Check, ChevronForward, Close, Cross, Hourglass } from "@/components/icons";
import { Alternatives, AnswerCard, AskedBubble, SellerBubble, StampMoment, Timeline } from "@/components/inquiry";
import { modelLine } from "@/components/product-grid-card";
import { SimulatedLabel } from "@/components/trust";
import { api, type InquiryOut } from "@/lib/api";
import { faDigits, timeFa } from "@/lib/format";
import { useLiveState } from "@/lib/live";
import { directionsUrl, placeLine } from "@/lib/place";
import { useApp } from "@/lib/store";

function Thread() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const inPlanOf = useApp((s) => s.plan);
  const togglePlan = useApp((s) => s.togglePlan);
  const q = useQuery({ queryKey: ["inquiry", id], queryFn: () => api<InquiryOut>(`/inquiries/${id}`) });
  const inq = q.data;
  // The stamp moment plays when the answer is new to this shopper: it lands live, or it was unread on open.
  const firstSeen = useRef<string | null>(null);
  const [moment, setMoment] = useState(false);

  useEffect(() => {
    useLiveState.getState().set({ viewing: id });
    return () => useLiveState.getState().set({ viewing: null });
  }, [id]);
  useEffect(() => {
    if (!inq) return;
    if (firstSeen.current === null) firstSeen.current = inq.status;
    if (inq.outcome === "answered" && (inq.unread || firstSeen.current !== "answered") && !moment) {
      setMoment(true);
    }
    if (inq.unread) {
      api<InquiryOut>(`/inquiries/${id}/read`, undefined, { method: "POST" }).then((r) => {
        qc.setQueryData(["inquiry", id], r);
        qc.invalidateQueries({ queryKey: ["inquiries"] });
      }, () => {});
    }
  }, [inq, id, qc, moment]);

  const act = useMutation({
    mutationFn: (a: "nudge" | "cancel") => api<InquiryOut>(`/inquiries/${id}/${a}`, undefined, { method: "POST" }),
    onSuccess: (r, a) => {
      qc.setQueryData(["inquiry", id], r);
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      push({ text: a === "nudge" ? "دوباره یادآوری شد" : "پیگیری لغو شد" });
    },
  });

  if (q.isError) {
    return (
      <div className="flex h-dvh flex-col">
        <main className="p-4"><div className="flex flex-col items-start gap-2 rounded-card bg-beet-tint p-4 text-sm text-beet">
          این پیگیری پیدا نشد.<Link href="/inquiries" className="flex min-h-11 items-center font-bold text-radish">همه پیگیری‌ها</Link>
        </div></main>
        <BottomNav />
      </div>
    );
  }
  const model = inq?.product ? modelLine(inq.product.title, inq.product.model) : null;
  const inPlan = !!inq && inPlanOf.some((p) => p.shopId === inq.shop.id);
  const plan = () => {
    if (!inq) return;
    const added = togglePlan({ shopId: inq.shop.id, shopName: inq.shop.name, lat: inq.shop.lat, lng: inq.shop.lng,
      mallId: inq.shop.location.mall?.id ?? null, productId: inq.product?.id ?? null, productTitle: inq.product?.title ?? null });
    if (added) push({ text: "به برنامه اضافه شد", icon: <Check size={16} color="var(--color-radish-night)" />, action: { label: "ببین", onClick: () => router.push("/plan") } });
  };
  const waiting = inq?.outcome === "waiting";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-line bg-card ps-4 pe-3 pt-0.5 pb-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/inquiries"))} aria-label="برگشت"
            className="flex h-11 w-10 flex-none items-center justify-center"><ChevronForward size={22} className="rotate-180" /></button>
          <div className="flex min-w-0 flex-1 flex-col">
            <Link href={inq ? `/shop/${inq.shop.id}` : "#"} className="truncate text-base font-bold">{inq?.shop.name ?? "…"}</Link>
            {inq && (
              <span className="truncate text-[11.5px] text-stem">
                {model ? <bdi>{model}</bdi> : inq.product?.title}
                {[inq.detail && faDigits(inq.detail), placeLine(inq.shop)].filter(Boolean).map((x) => `، ${x}`).join("")}
              </span>
            )}
          </div>
        </div>
        {inq && <Timeline inq={inq} />}
      </header>

      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-4 pb-5">
        {!inq && <div className="flex justify-center py-10"><Glasses width={44} blink /></div>}
        {inq && (
          <>
            {!moment && <AskedBubble inq={inq} />}
            {waiting && (
              <>
                <div className="flex flex-none flex-col items-center gap-2.5 rounded-card bg-card p-4 text-center">
                  <Glasses width={56} blink />
                  <span className="text-[15px] font-bold">
                    {inq.status === "seen" ? `${inq.shop.name} پیام را دید` : inq.status === "delivered" ? "پیام به فروشنده رسید" : "پیام فرستاده شد"}
                  </span>
                  <span className="text-[13px] leading-[1.8] text-stem [text-wrap:pretty]">
                    {inq.open_now.state === "closed" ? inq.preview + "." : "وقتی جواب بدهد خبرت می‌کنم؛ می‌توانی از این صفحه بیرون بروی."}
                  </span>
                </div>
                {inq.listed_note === null && inq.product && (
                  <div className="flex-none overflow-hidden rounded-card bg-card">
                    <div className="flex items-center gap-2 px-3.5 py-[11px] text-[13px]">
                      <span className="text-stem">موجودی</span>
                      <span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
                      <span className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-dashed border-ash px-[9px] text-[11.5px] text-stem"><b>؟</b>منتظر جواب</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {inq.outcome === "answered" && (
              <>
                {moment && <StampMoment inq={inq} />}
                <AnswerCard inq={inq} />
                {inq.listed_note && <span className="px-1 text-xs leading-[1.7] text-stem">{inq.listed_note}</span>}
              </>
            )}
            {inq.outcome === "out_of_stock" && (
              <div className="flex flex-none flex-col gap-2.5 rounded-card bg-card p-3.5">
                <span className="inline-flex h-[30px] items-center gap-1.5 self-start rounded-full bg-beet-tint px-3 text-[13px] font-bold text-beet">
                  <Cross size={13} />ناموجود{inq.answered_at ? `، ${timeFa(inq.answered_at)}` : ""}
                </span>
                <SellerBubble inq={inq} />
              </div>
            )}
            {inq.outcome === "no_answer" && (
              <div className="flex flex-none flex-col gap-3 rounded-card bg-card p-3.5">
                <div className="flex items-start gap-2">
                  <Hourglass size={16} color="var(--color-wilt)" className="mt-1" />
                  <span className="text-[13.5px] leading-[1.8]"><b className="text-wilt">{inq.failure_note}</b></span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  {inq.can_nudge ? (
                    <button type="button" onClick={() => act.mutate("nudge")} disabled={act.isPending}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-button border-[1.5px] border-radish text-[13.5px] font-bold text-radish">
                      یادآوری دوباره
                    </button>
                  ) : <span className="flex h-11 items-center text-xs text-stem">یک بار یادآوری شده است.</span>}
                  <Link href="/inquiries" className="flex h-11 items-center gap-1.5 rounded-button bg-flesh px-4 text-[13.5px] font-semibold">همه پیگیری‌ها</Link>
                </div>
              </div>
            )}
            {inq.outcome === "cancelled" && (
              <p className="rounded-card bg-card p-4 text-[13px] text-stem">این پیگیری را لغو کردی؛ فروشنده دیگر جواب نمی‌دهد.</p>
            )}
            {(inq.outcome === "no_answer" || inq.outcome === "out_of_stock") && <Alternatives inq={inq} />}
            {inq.channel === "panel" && waiting && (
              <span className="flex items-center gap-1.5 px-1 text-[11px] text-stem">این فروشگاه الان از پنل فروشنده جواب می‌دهد.</span>
            )}
            {inq.simulated && waiting && <SimulatedLabel />}
          </>
        )}
      </main>

      {inq && inq.outcome === "answered" && (
        <div className="grid flex-none grid-cols-[1fr_auto] gap-2 border-t border-line bg-card px-4 py-2.5">
          <button type="button" onClick={plan} aria-pressed={inPlan}
            className={`flex h-[52px] items-center justify-center gap-2 rounded-button border-[1.5px] border-radish text-[15px] font-bold ${moment || inPlan ? "bg-card text-radish" : "bg-radish text-white"}`}>
            {inPlan ? "در برنامه" : "به برنامه اضافه کن"}
          </button>
          <a href={directionsUrl(inq.shop.lat, inq.shop.lng)} target="_blank" rel="noopener"
            className="flex h-[52px] items-center rounded-button border-[1.5px] border-radish px-[18px] text-[14.5px] font-bold text-radish">مسیر</a>
        </div>
      )}
      {inq && waiting && (
        <div className="grid flex-none grid-cols-[1fr_auto] gap-2 border-t border-line bg-card px-4 py-2.5">
          <Link href={inq.product ? `/product/${inq.product.id}/sellers` : "/"}
            className="flex h-[50px] items-center justify-center rounded-button border-[1.5px] border-radish text-sm font-bold text-radish">
            از فروشنده‌ی دیگر هم بپرس
          </Link>
          {inq.can_cancel && (
            <button type="button" onClick={() => act.mutate("cancel")} disabled={act.isPending}
              className="flex h-[50px] items-center gap-1.5 rounded-button bg-beet-tint px-4 text-sm font-bold text-beet"><Close size={14} color="var(--color-beet)" />لغو</button>
          )}
        </div>
      )}
      <BottomNav />
    </div>
  );
}

export default function ThreadPage() {
  return <Suspense><Thread /></Suspense>;
}
