"use client";
// F7 Sellers (Bebin Product.dc.html #9a list, #9b why-sheet, #10 map). Ranking, filters and view live in the URL.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useRef, useState } from "react";
import { BottomNav, BottomSheet, LocationChip } from "@/components/chrome";
import { Check, ChevronDown, ChevronForward, Info, Store } from "@/components/icons";
import { LocationSheet } from "@/components/location";
import { ImageBox, modelLine } from "@/components/product-grid-card";
import { SellerRowView } from "@/components/seller-row";
import { OpenStatusPill, TierLabel } from "@/components/trust";
import { api, type ProductDetail, type SellerRow, type SellersOut } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { distance, faNum, timeFa, tomanRange } from "@/lib/format";
import { useApp } from "@/lib/store";

const SellersMap = dynamic(() => import("@/components/sellers-map"), { ssr: false });

const MODES = [["balanced", "متعادل"], ["cheapest", "ارزان‌ترین"], ["nearest", "نزدیک‌ترین"]] as const;
const FACTORS = [
  ["price", "قیمت", "var(--color-soil)"], ["distance", "فاصله", "var(--color-stem)"], ["open", "باز بودن", "var(--color-ash)"],
  ["fresh", "به‌روز بودن قیمت", "var(--color-leader)"], ["verified", "تأیید فروشنده", "var(--color-stamp)"],
] as const;
const THING: Record<string, string> = { installments: "اقساط", torob_pay: "ترب‌پی", kala_barg: "کالابرگ", fast_delivery: "ارسال فوری", open: "ساعت کاری" };

/** 200ms FLIP when the ranking reorders rows (Handoff 9a). */
function useFlip(keys: string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, k) => {
      const top = el.getBoundingClientRect().top;
      const before = prev.current.get(k);
      if (!reduce && before != null && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 200, easing: "ease-out" });
      }
      prev.current.set(k, top);
    });
  }, [keys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (k: string) => (el: HTMLElement | null) => { if (el) nodes.current.set(k, el); else nodes.current.delete(k); };
}

function Segmented<T extends string>({ options, value, onChange, h = 44 }:
  { options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; h?: number }) {
  return (
    <div role="radiogroup" className="grid gap-1 rounded-button bg-mist p-1" style={{ height: h, gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`rounded-[9px] text-[13.5px] ${value === k ? "bg-card font-bold text-radish shadow-hair" : "text-stem"}`}>{l}</button>
      ))}
    </div>
  );
}

function WhySheet({ open, onClose, data, mode, setMode }:
  { open: boolean; onClose: () => void; data: SellersOut; mode: string; setMode: (m: string) => void }) {
  const label = MODES.find((m) => m[0] === mode)?.[1] ?? "متعادل";
  const rows = [...data.listed].sort((a, b) => b.score - a.score);
  return (
    <BottomSheet open={open} onClose={onClose} title="چرا این ترتیب؟" top={110}>
      <Segmented options={MODES} value={mode as (typeof MODES)[number][0]} onChange={setMode} h={40} />
      <div className="flex flex-col gap-1.5 px-1">
        <span className="text-xs text-stem">وزن هر معیار در حالت «{label}»</span>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" aria-hidden>
          {FACTORS.map(([k, , c]) => <span key={k} className="h-2.5" style={{ flex: data.weights[k] ?? 0, background: c }} />)}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {FACTORS.map(([k, l, c]) => (
            <span key={k} className="flex items-center gap-[5px] text-[11.5px]">
              <span className="size-2 rounded-[2px]" style={{ background: c }} />{l} <b className="font-bold">{faNum(Math.round((data.weights[k] ?? 0) * 100))}٪</b>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.shop.id} className="flex flex-col gap-2 border-b border-line py-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[14.5px] font-bold">{r.shop.name}</span>
              <span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-line" />
              <span className="text-[15px] font-extrabold">{faNum(Math.round(r.score * 100))}</span>
              <span className="text-[11px] text-stem">از ۱۰۰</span>
            </div>
            {FACTORS.map(([k, l]) => {
              const v = r.components[k];
              const unknown = r.unknown_factors?.includes(k);
              const isV = k === "verified";
              const verified = r.stock.state !== "unknown" || r.price.kind === "verified";
              return (
                <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-2">
                  <span className="text-[11.5px] whitespace-nowrap text-stem">{l}</span>
                  <span className="relative block h-2 overflow-hidden rounded bg-mist">
                    <span className={`absolute inset-y-0 start-0 rounded ${unknown ? "border-[1.5px] border-dashed border-ash" : isV ? "bg-stamp" : "bg-soil"}`}
                      style={{ width: `${Math.round((isV && !verified ? 0 : v) * 100)}%` }} />
                  </span>
                  <span className={`text-end text-[11px] font-semibold whitespace-nowrap ${isV && verified ? "text-stamp" : "text-stem"}`}>
                    {unknown ? "نامشخص" : isV ? (verified && r.stock.verified_at ? `تأیید ${timeFa(r.stock.verified_at)}` : "جواب نداده") : faNum(Math.round(v * 100))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <p className="pt-3 text-[11.5px] leading-[1.8] text-stem [text-wrap:pretty]">
          امتیاز معیارهای نامشخص (خط‌چین) خنثی حساب می‌شود؛ نه جایزه می‌گیرند، نه جریمه. تأیید فروشنده فقط وقتی امتیاز دارد که فروشنده جواب داده باشد.
        </p>
      </div>
    </BottomSheet>
  );
}

function Related({ data, product }: { data: SellersOut; product: { id: string; title: string } }) {
  const [open, setOpen] = useState(true);
  const openComposer = useComposer((s) => s.open);
  if (!data.related.length) return null;
  return (
    <section className="mx-4 flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex h-12 items-center gap-2 px-1">
        <span className="text-[15px] font-bold">فروشگاه‌های مرتبط</span>
        <span className="flex h-[22px] items-center rounded-full border-[1.5px] border-dashed border-ash px-2 text-[11px] text-stem">{faNum(data.related.length)}</span>
        <span className="flex-1" />
        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>
      {open && data.related.map((r) => (
        <div key={r.shop.id} className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-leader bg-card p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold">{r.shop.name}</span>
            <span className="mb-[7px] flex-1 self-end border-b-[1.5px] border-dotted border-line" />
            <span className="flex h-6 items-center rounded-full border-[1.5px] border-dashed border-ash px-[9px] text-[11.5px] whitespace-nowrap text-stem">بدون قیمت برای این کالا</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {r.distance_m != null && <span className="text-xs">{distance(r.distance_m)}</span>}
            <TierLabel tier="related" />
            <OpenStatusPill status={r.open_status} size="sm" />
          </div>
          <p className="text-[12.5px] leading-[1.75] text-stem">این کالا در فهرست {r.shop.name} نیست. {data.related_note.replace(/^این فروشگاه‌ها /, "در ")}</p>
          <button type="button" onClick={() => openComposer({ productId: product.id, productTitle: product.title, shops: [{ id: r.shop.id, name: r.shop.name, open: r.open_status }], preset: ["has_model"] })}
            className="flex h-[42px] items-center justify-center rounded-button border-[1.5px] border-radish text-[13px] font-bold text-radish">
            بپرس که این مدل را دارد؟
          </button>
        </div>
      ))}
    </section>
  );
}

function Sellers() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const loc = useApp((s) => s.location);
  const [why, setWhy] = useState(false);
  const [locSheet, setLocSheet] = useState(false);
  const mode = sp.get("mode") ?? "balanced";
  const view = sp.get("view") === "map" ? "map" : "list";
  const pay = sp.getAll("pay");
  const openOnly = sp.get("open") === "1";
  const radius = sp.get("radius");
  const unk = sp.get("unk") === "1";
  const set = (patch: Record<string, string | string[] | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      u.delete(k);
      if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
      else if (v != null) u.set(k, v);
    }
    router.replace(`${path}?${u.toString()}`, { scroll: false });
  };

  const detail = useQuery({ queryKey: ["product", id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
  const q = useQuery({
    queryKey: ["sellers", id, mode, loc?.lat, loc?.lng, sp.toString()],
    queryFn: () => api<SellersOut>(`/products/${id}/sellers`, {
      lat: loc?.lat, lng: loc?.lng, mode, pay, open: openOnly, radius, unk,
    }),
    placeholderData: keepPreviousData,
  });
  const data = q.data;
  const rows = data?.listed ?? [];
  const flip = useFlip(rows.map((r) => r.shop.id));
  const p = detail.data;
  const product = p ? { id: p.id, title: p.title } : null;
  const model = p && modelLine(p.title, p.model);
  const modeLabel = MODES.find((m) => m[0] === mode)?.[1] ?? "متعادل";

  const chips: [string, string, boolean, () => void][] = [
    ["inst", "اقساطی", pay.includes("installments"), () => set({ pay: pay.includes("installments") ? pay.filter((x) => x !== "installments") : [...pay, "installments"], unk: null })],
    ["open", "الان باز", openOnly, () => set({ open: openOnly ? null : "1", unk: null })],
    ["tp", "ترب‌پی", pay.includes("torob_pay"), () => set({ pay: pay.includes("torob_pay") ? pay.filter((x) => x !== "torob_pay") : [...pay, "torob_pay"], unk: null })],
    ["d3", "تا ۳ کیلومتر", radius === "3", () => set({ radius: radius === "3" ? null : "3" })],
  ];
  const hiddenUnk = Object.values(data?.excluded_unknown ?? {}).reduce((a, b) => a + b, 0);
  const things = Object.keys(data?.excluded_unknown ?? {}).map((k) => THING[k] ?? k).join(" و ");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none items-center gap-2 border-b border-line bg-card ps-4 pe-3 pt-0.5 pb-2.5">
        <button type="button" onClick={() => router.push(`/product/${id}`)} aria-label="برگشت به کالا" className="flex h-11 w-10 flex-none items-center justify-center">
          <ChevronForward size={22} className="rotate-180" />
        </button>
        <ImageBox src={p?.images[0]} className="size-11 flex-none rounded-[10px] border border-line p-0.5" />
        <div className="flex min-w-0 flex-1 flex-col">
          {model ? <bdi dir="ltr" className="block truncate text-start text-[14.5px] font-bold">{model}</bdi>
            : <span className="truncate text-[14.5px] font-bold">{p?.title ?? "…"}</span>}
          <span className="truncate text-[11.5px] text-stem">
            {p && [tomanRange(p.price_range.min, p.price_range.max) && `${tomanRange(p.price_range.min, p.price_range.max)} تومان`, `${faNum(p.seller_count)} فروشنده`].filter(Boolean).join("، ")}
          </span>
        </div>
      </header>

      {view === "map" ? (
        data && p ? <SellersMap data={data} product={product!} onList={() => set({ view: null })} /> : <div className="flex-1 bg-[#E8ECE7]" />
      ) : (
        <main className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pt-3 pb-6">
          <div className="flex items-center justify-between gap-2 px-4">
            <LocationChip onClick={() => setLocSheet(true)} open={locSheet} />
            <div role="radiogroup" aria-label="نمایش" className="flex h-[38px] gap-[3px] rounded-[10px] bg-mist p-[3px]">
              <span role="radio" aria-checked className="flex items-center gap-[5px] rounded-lg bg-card px-3 text-[13px] font-bold text-radish shadow-hair"><Store size={14} />فهرست</span>
              <button type="button" role="radio" aria-checked={false} onClick={() => set({ view: "map" })} className="flex items-center gap-[5px] rounded-lg px-3 text-[13px] text-stem">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" /></svg>نقشه
              </button>
            </div>
          </div>
          <div className="no-scrollbar flex flex-none gap-1.5 overflow-x-auto px-4 py-1">
            {chips.map(([k, l, on, click]) => (
              <button key={k} type="button" aria-pressed={on} onClick={click}
                className={`hit flex h-9 flex-none items-center gap-[5px] rounded-full border-[1.5px] px-3 text-[13px] whitespace-nowrap ${on ? "border-radish bg-radish-tint font-semibold" : "border-line bg-card"}`}>
                {on && <Check size={12} color="var(--color-radish)" sw={3.2} />}{l}
              </button>
            ))}
          </div>
          <div className="mx-4"><Segmented options={MODES} value={mode as (typeof MODES)[number][0]} onChange={(m) => set({ mode: m === "balanced" ? null : m })} /></div>
          <div className="flex items-baseline justify-between px-5">
            <span className="text-[13px] font-bold">{data ? `${faNum(rows.length)} فروشگاه، ترتیب: ${modeLabel}` : "…"}</span>
            <button type="button" onClick={() => setWhy(true)} className="hit flex items-center gap-1 text-[13px] font-semibold text-radish"><Info size={14} />چرا این ترتیب؟</button>
          </div>
          {!data?.has_location && data && (
            <p className="mx-4 rounded-button bg-wilt-tint px-3 py-2 text-[12.5px] text-wilt">موقعیتت مشخص نیست، پس فاصله در ترتیب حساب نشده.</p>
          )}
          {data && (hiddenUnk > 0 || data.excluded_other > 0) && (
            <div className="mx-4 flex items-start gap-2 rounded-button border-[1.5px] border-dashed border-ash px-3 py-2.5">
              <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-ash text-[11px] font-bold text-stem">؟</span>
              <p className="flex-1 text-[12.5px] leading-[1.8]">
                {hiddenUnk > 0 && `${faNum(hiddenUnk)} فروشگاه با ${things} نامشخص پنهان شد. `}
                {data.excluded_other > 0 && `${faNum(data.excluded_other)} فروشگاه با این فیلترها جور نیست. `}
                {hiddenUnk > 0 && <button type="button" onClick={() => set({ unk: "1" })} className="hit font-bold whitespace-nowrap text-radish">نمایش بده</button>}
              </p>
            </div>
          )}
          {data && !rows.length && (
            <p className="mx-4 rounded-card bg-card p-4 text-sm text-stem">با این فیلترها فروشگاهی نماند. یک فیلتر را بردار.</p>
          )}
          {!data && <div className="mx-4 h-64 rounded-card bg-card" aria-busy />}
          {!!rows.length && (
            <div className={`mx-4 flex-none overflow-hidden rounded-card bg-card ${q.isPlaceholderData ? "opacity-60" : ""}`}>
              {rows.map((r: SellerRow) => (
                <div key={r.shop.id} ref={flip(r.shop.id)} className="border-b border-line last:border-b-0">
                  <SellerRowView row={r} product={product} />
                </div>
              ))}
            </div>
          )}
          {data && product && <Related data={data} product={product} />}
        </main>
      )}
      {data && <WhySheet open={why} onClose={() => setWhy(false)} data={data} mode={mode} setMode={(m) => set({ mode: m === "balanced" ? null : m })} />}
      <LocationSheet open={locSheet} onClose={() => setLocSheet(false)} />
      <BottomNav />
    </div>
  );
}

export default function SellersPage() {
  return <Suspense><Sellers /></Suspense>;
}
