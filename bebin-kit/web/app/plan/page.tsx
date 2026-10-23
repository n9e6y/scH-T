"use client";
// F12 Visit plan (Bebin Plan.dc.html 20a today, 20b demo clock, 20c empty). The API orders stops, groups malls
// and computes status *at arrival*; this page edits the stop list (drag, swap, remove) and the start/mode.
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MiniStamp } from "@/components/brand";
import { BottomNav } from "@/components/chrome";
import { EmptyState } from "@/components/empty-state";
import { Check, ChevronDown, Close, Hourglass, Moon, Route } from "@/components/icons";
import { ImageBox, modelLine } from "@/components/product-grid-card";
import { useComposer } from "@/lib/composer";
import { api, type PlanOut, type PlanStopOut, type ProductDetail } from "@/lib/api";
import { faNum, tomanRange } from "@/lib/format";
import { directionsUrl } from "@/lib/place";
import { useApp } from "@/lib/store";

const STATUS_CLS: Record<PlanStopOut["status"], string> = {
  open: "bg-leaf-tint text-leaf-ink font-semibold",
  closing: "bg-wilt-tint text-wilt font-semibold",
  closed_on_arrival: "bg-wilt-tint text-wilt font-semibold",
  closed_now: "bg-beet-tint text-beet font-semibold",
  unknown: "border-[1.5px] border-dashed border-ash text-stem",
};

function StatusPill({ s }: { s: PlanStopOut }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ${STATUS_CLS[s.status]}`}>
      {s.status === "open" && <span className="size-[7px] rounded-full bg-leaf-ink" />}
      {(s.status === "closing" || s.status === "closed_on_arrival") && <Hourglass size={13} />}
      {s.status === "closed_now" && <Moon size={13} />}
      {s.status === "unknown" && <b>؟</b>}
      {s.status_text}
    </span>
  );
}

function Saved() {
  const ids = useApp((s) => s.saved);
  const qs = useQueries({ queries: ids.slice(0, 8).map((id) => ({ queryKey: ["product", id], queryFn: () => api<ProductDetail>(`/products/${id}`) })) });
  const items = qs.map((q) => q.data).filter(Boolean) as ProductDetail[];
  if (!items.length) return null;
  return (
    <section className="mt-3 flex flex-none flex-col gap-2.5">
      <h2 className="px-1 text-base font-bold">ذخیره‌شده‌ها</h2>
      <span className="px-1 text-xs text-stem">کالاها</span>
      <div className="overflow-hidden rounded-card bg-card">
        {items.map((p) => {
          const model = modelLine(p.title, p.model);
          return (
            <div key={p.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
              <ImageBox src={p.images[0]} className="size-11 flex-none rounded-[10px] p-0.5" />
              <div className="flex min-w-0 flex-1 flex-col">
                {model ? <bdi dir="ltr" className="block truncate text-start text-[13.5px] font-bold">{model}</bdi> : <span className="truncate text-[13.5px] font-bold">{p.title}</span>}
                <span className="text-[11.5px] text-stem">
                  {[tomanRange(p.price_range.min, p.price_range.max) && `${tomanRange(p.price_range.min, p.price_range.max)} تومان`, `${faNum(p.seller_count)} فروشنده`, p.freshest === "stale" && "قیمت قدیمی"].filter(Boolean).join("، ")}
                </span>
              </div>
              <Link href={`/product/${p.id}/sellers`} className="flex h-9 items-center rounded-button border-[1.5px] border-radish px-3 text-[12.5px] font-bold text-radish">فروشنده‌ها</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Pointer drag on the handle (works on touch, unlike HTML5 drag-and-drop) + 200ms FLIP on reorder. */
function useReorder(keys: string[], onMove: (from: number, to: number) => void) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());
  const [dragging, setDragging] = useState<string | null>(null);
  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, k) => {
      const top = el.getBoundingClientRect().top;
      const before = prev.current.get(k);
      if (!reduce && before != null && before !== top && k !== dragging) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 200, easing: "ease-out" });
      }
      prev.current.set(k, top);
    });
  }, [keys.join("|"), dragging]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = (k: string) => (el: HTMLElement | null) => { if (el) nodes.current.set(k, el); else nodes.current.delete(k); };
  const handle = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(k);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragging !== k) return;
      const from = keys.indexOf(k);
      const to = keys.findIndex((kk) => {
        const r = nodes.current.get(kk)?.getBoundingClientRect();
        return r && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (to >= 0 && to !== from) onMove(from, to);
    },
    onPointerUp: () => setDragging(null),
    onPointerCancel: () => setDragging(null),
  });
  return { ref, handle, dragging };
}

export default function PlanPage() {
  const plan = useApp((s) => s.plan);
  const setPlan = useApp((s) => s.setPlan);
  const ordered = useApp((s) => s.planOrdered);
  const setOrdered = useApp((s) => s.setPlanOrdered);
  const loc = useApp((s) => s.location);
  const last = useApp((s) => s.lastViewed);
  const demo = useApp((s) => s.demoClock);
  const openComposer = useComposer((s) => s.open);
  const [mode, setMode] = useState<"walk" | "car">("walk");
  const [shift, setShift] = useState(0); // start chip cycles now → +30 → +60 minutes
  const [startAt, setStartAt] = useState<string | null>(null);
  const cycleStart = () => {
    const next = (shift + 1) % 3;
    setShift(next);
    const base = demo ? new Date(demo + (/[zZ+]/.test(demo.slice(10)) ? "" : "+03:30")).getTime() : Date.now();
    setStartAt(next ? new Date(base + next * 30 * 60_000).toISOString() : null);
  };

  const body = useMemo(() => ({
    stops: plan.map((p) => ({ shop_id: p.shopId, product_id: p.productId })), lat: loc?.lat, lng: loc?.lng,
    start_label: loc?.name, start_at: startAt, mode, optimize: !ordered,
  }), [plan, loc, mode, ordered, startAt]);
  const q = useQuery({
    queryKey: ["plan", body], queryFn: () => api<PlanOut>("/plan", undefined, { method: "POST", body: JSON.stringify(body) }),
    enabled: plan.length > 0, placeholderData: keepPreviousData,
  });
  const d = q.data;
  const keys = d?.stops.map((s) => s.key) ?? [];
  const move = (from: number, to: number) => {
    if (!d) return;
    const order = d.stops.map((s) => s.shop_ids);
    const [m] = order.splice(from, 1);
    order.splice(to, 0, m);
    const byId = new Map(plan.map((p) => [p.shopId, p]));
    setPlan(order.flat().map((id) => byId.get(id)!).filter(Boolean));
    setOrdered(true);
  };
  const { ref, handle, dragging } = useReorder(keys, move);
  const swap = (s: PlanStopOut) => {
    const alt = s.alternative!;
    setPlan(plan.map((p) => (p.shopId === s.shop_ids[0]
      ? { ...p, shopId: alt.shop_id, shopName: alt.name, swappedFrom: { shopId: p.shopId, shopName: p.shopName } } : p)));
  };
  const undo = (shopId: string) => {
    setPlan(plan.map((p) => (p.shopId === shopId && p.swappedFrom ? { ...p, shopId: p.swappedFrom.shopId, shopName: p.swappedFrom.shopName, swappedFrom: null } : p)));
  };
  const remove = (shopId: string) => setPlan(plan.filter((p) => p.shopId !== shopId));
  const swappedOf = (s: PlanStopOut) => plan.find((p) => s.shop_ids.includes(p.shopId) && p.swappedFrom);

  if (!plan.length) {
    return (
      <div className="flex h-dvh flex-col">
        <header className="flex-none px-5 pt-1.5"><h1 className="text-2xl font-extrabold">برنامه من</h1></header>
        <EmptyState pose="default" title="هنوز برنامه‌ای نچیدی"
          body="در فهرست فروشنده‌ها «به برنامه اضافه کن» را بزن. ترتیب، زمان رسیدن و اینکه وقتی برسی باز است یا نه را خودم حساب می‌کنم." />
        {last && (
          <div className="flex flex-none flex-col gap-2 px-4 pb-4">
            <Link href={`/product/${last.id}`} className="flex items-center gap-3 rounded-card bg-card px-3.5 py-3">
              <ImageBox src={last.image} className="size-11 flex-none rounded-[10px] p-0.5" />
              <div className="flex min-w-0 flex-1 flex-col"><span className="text-[11.5px] text-stem">آخرین کالایی که دیدی</span><span className="truncate text-[13.5px] font-bold">{last.title}</span></div>
              <span className="text-xs text-stem">{faNum(last.sellers)} فروشنده</span>
            </Link>
            <Link href={`/product/${last.id}/sellers`} className="flex h-[54px] items-center justify-center rounded-button bg-radish text-base font-bold text-white">فروشنده‌ها را ببین</Link>
          </div>
        )}
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-line bg-card px-5 pt-1.5 pb-3.5">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-2xl font-extrabold">برنامه من</h1>
          {d?.demo_clock && <span className="flex h-[26px] items-center gap-[5px] rounded-full border-[1.5px] border-soil px-2.5 text-[11.5px] font-semibold"><Hourglass size={12} />ساعت نمایشی</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={cycleStart}
            className="hit flex h-[42px] min-w-0 flex-1 items-center gap-1.5 rounded-button border-[1.5px] border-line px-3 text-[13.5px]">
            <Route size={15} /><span className="truncate">{d?.start_text ?? "…"}</span><span className="flex-1" /><ChevronDown size={14} color="var(--color-stem)" />
          </button>
          <div role="radiogroup" aria-label="وسیله" className="flex h-[42px] flex-none gap-[3px] rounded-button bg-mist p-[3px]">
            {([["walk", "پیاده"], ["car", "ماشین"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className={`rounded-[9px] px-3 text-[13px] ${mode === k ? "bg-card font-bold text-radish shadow-hair" : "text-stem"}`}>{l}</button>
            ))}
          </div>
        </div>
        {d && <div className="flex items-baseline gap-2"><span className="text-[15px] font-bold">{d.end_text}</span><span className="text-xs text-stem">{d.meta}</span></div>}
        {!loc && <p className="text-xs text-wilt">موقعیتت انتخاب نشده؛ فاصله و زمان رسیدن حساب نمی‌شود.</p>}
      </header>

      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3.5 pb-6">
        {d?.banner && (
          <div className="flex flex-none flex-col gap-2.5 rounded-card border border-line bg-card px-3.5 py-3">
            <div className="flex items-start gap-2"><Hourglass size={16} color="var(--color-wilt)" className="mt-1" /><span className="text-[13.5px] leading-[1.8]">{d.banner}</span></div>
            <div className="flex flex-wrap gap-2">
              {d.banner_start_at && (
                <button type="button" onClick={() => { setShift(0); setStartAt(d.banner_start_at!); }} className="flex h-10 items-center rounded-button bg-radish px-3.5 text-[13px] font-bold text-white">{d.banner_start_label}</button>
              )}
              {d.stops.some((s) => s.alternative) && (
                <button type="button" onClick={() => d.stops.filter((s) => s.alternative).forEach(swap)}
                  className="flex h-10 items-center rounded-button border-[1.5px] border-radish px-3.5 text-[13px] font-bold text-radish">همه را جایگزین کن</button>
              )}
            </div>
          </div>
        )}
        {!d && <div className="h-64 flex-none rounded-card bg-card" aria-busy />}
        {d && (
          <ol className={`relative flex flex-none flex-col ${q.isPlaceholderData ? "opacity-70" : ""}`}>
            <span className="absolute start-[13px] top-3.5 bottom-[30px] w-0.5 rounded-sm bg-radish" aria-hidden />
            {d.stops.map((s, i) => {
              const sw = swappedOf(s);
              return (
                <li key={s.key} ref={ref(s.key)} className={`flex flex-col ${dragging === s.key ? "opacity-60" : ""}`}>
                  <div className="flex h-[30px] items-center ps-[38px] text-[11.5px] text-stem"><Route size={12} className="me-1.5" />{s.leg}</div>
                  <div className="flex items-start gap-2.5">
                    <span className="relative z-[1] mt-3 flex size-7 flex-none items-center justify-center rounded-full border-2 border-flesh bg-radish text-[13px] font-extrabold text-white" style={{ boxSizing: "content-box", marginInlineStart: -2 }}>{faNum(i + 1)}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-card bg-card px-3.5 py-3">
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="text-[15.5px] leading-normal font-bold">{s.title}</span>
                          <span className="text-xs leading-[1.6] text-stem">{s.place}</span>
                        </div>
                        <button type="button" aria-label={`جابه‌جا کردن ${s.title}`} {...handle(s.key)}
                          className="-me-2 flex h-11 w-8 flex-none cursor-grab touch-none items-center justify-center text-stem">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                        </button>
                      </div>
                      <span className="text-[12.5px]">{s.arrive}</span>
                      <div className="flex flex-wrap gap-1.5"><StatusPill s={s} /></div>
                      <div className="flex flex-col border-t border-line">
                        {s.subs.map((u) => (
                          <div key={u.shop_id} className="flex items-start gap-2 border-b border-dotted border-line py-2 last:border-b-0">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              {(s.subs.length > 1 || s.key.startsWith("mall:")) && (
                                <div className="flex items-baseline gap-1.5"><Link href={`/shop/${u.shop_id}`} className="text-[13.5px] font-bold">{u.name}</Link>{u.unit && <span className="text-[11.5px] text-stem">{u.unit}</span>}</div>
                              )}
                              {u.item && <bdi className="text-[12.5px]">{u.item}</bdi>}
                              {u.verified ? (
                                <span className="inline-flex h-7 items-center gap-[5px] self-start rounded-full border-[1.5px] border-stamp-ink bg-stamp-tint ps-1 pe-2.5 text-[11.5px] font-bold text-stamp"><MiniStamp size={20} />{u.verified}</span>
                              ) : u.verified_old ? (
                                <span className="inline-flex h-[26px] items-center self-start rounded-full border border-leader px-2.5 text-[11.5px] text-stem">{u.verified_old}</span>
                              ) : u.item ? (
                                <span className="inline-flex h-[26px] items-center gap-1 self-start rounded-full border-[1.5px] border-dashed border-ash px-2.5 text-[11.5px] text-stem"><b>؟</b>موجودی نامشخص</span>
                              ) : null}
                            </div>
                            <button type="button" onClick={() => remove(u.shop_id)} aria-label={`حذف ${u.name} از برنامه`} className="hit flex size-7 flex-none items-center justify-center rounded-full bg-flesh">
                              <Close size={11} color="var(--color-stem)" />
                            </button>
                          </div>
                        ))}
                      </div>
                      {s.alternative && !sw && (
                        <div className="flex flex-col gap-1.5 rounded-button bg-flesh px-3 py-2.5">
                          <span className="text-[11.5px] text-stem">پیشنهاد جایگزین</span>
                          <span className="text-[13px] leading-[1.7]"><b>{s.alternative.name}</b>، {s.alternative.reason}</span>
                        </div>
                      )}
                      {sw && (
                        <span className="text-[11.5px] text-stem">به جای {sw.swappedFrom!.shopName}، <button type="button" onClick={() => undo(sw.shopId)} className="hit font-bold text-radish">برگرداندن</button></span>
                      )}
                      <div className="flex gap-1.5">
                        {s.alternative && !sw && (
                          <button type="button" onClick={() => swap(s)} className="flex h-10 flex-1 items-center justify-center rounded-button bg-radish text-[13px] font-bold text-white">جایگزین کن</button>
                        )}
                        <a href={directionsUrl(s.lat, s.lng)} target="_blank" rel="noopener"
                          className="flex h-10 flex-1 items-center justify-center gap-[5px] rounded-button border-[1.5px] border-radish text-[13px] font-bold text-radish"><Route size={14} />مسیر</a>
                        {(s.can_ask || sw) && (
                          <button type="button" onClick={() => openComposer({ productId: plan.find((p) => s.shop_ids.includes(p.shopId))?.productId ?? null, productTitle: null,
                            shops: s.shop_ids.slice(0, 3).map((id) => ({ id, name: plan.find((p) => p.shopId === id)?.shopName ?? "" })), preset: ["hours"] })}
                            className="flex h-10 flex-1 items-center justify-center rounded-button border-[1.5px] border-line text-[13px] font-semibold">بپرس</button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            <li className="flex items-center gap-2.5 pt-3.5">
              <span className="relative z-[1] flex size-7 flex-none items-center justify-center rounded-full border-2 border-radish bg-card"><Check size={13} color="var(--color-radish)" /></span>
              <span className="text-[13px] font-semibold">{d.end_short}</span>
            </li>
          </ol>
        )}
        <Saved />
      </main>

      {d && (
        <div className="flex flex-none items-center gap-2.5 border-t border-line bg-card px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col"><span className="text-[13px] font-bold">{d.footer_title}</span><span className="text-[11.5px] text-stem">{d.footer_sub}</span></div>
          {d.nav_url && (
            <a href={d.nav_url} target="_blank" rel="noopener" className="flex h-[52px] items-center gap-2 rounded-button bg-radish px-[26px] text-base font-bold text-white"><Route size={18} color="#FFFFFF" />شروع</a>
          )}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
