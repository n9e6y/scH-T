"use client";
// Search 5: all filters. Edits a draft; every change re-queries for the live count on the sticky button.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, type Chip, type SearchOut } from "@/lib/api";
import { faNum, parseDigits, priceShort } from "@/lib/format";
import { CLEARED, draftParams, type Filters } from "@/lib/search-url";
import { useApp } from "@/lib/store";
import { Glasses } from "../brand";
import { BottomSheet } from "../chrome";
import { Check } from "../icons";

type Ctx = { chips: Chip[]; ign: string[]; areaActive: boolean };

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** RTL range slider: 0 on the right, min thumb outlined, max thumb filled. Pointer drag anywhere on the track. */
function PriceRange({ bound, min, max, onChange }:
  { bound: number; min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<"min" | "max" | null>(null);
  const step = Math.max(10_000, Math.round(bound / 160 / 10_000) * 10_000);
  const lo = min ?? 0, hi = max ?? bound;
  const pct = (v: number) => Math.min(100, (v / bound) * 100);

  const valAt = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (r.right - x) / r.width));
    return Math.round((f * bound) / step) * step;
  };
  const set = (which: "min" | "max", v: number) => {
    if (which === "min") { const n = Math.min(v, hi - step); onChange(n <= 0 ? null : n, max); }
    else { const n = Math.max(v, lo + step); onChange(min, n >= bound ? null : n); }
  };
  const onDown = (e: React.PointerEvent) => {
    const v = valAt(e.clientX);
    drag.current = Math.abs(v - lo) <= Math.abs(v - hi) && v < hi ? "min" : "max";
    set(drag.current, v);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const thumb = "absolute top-1.5 size-6 -me-3 rounded-full border-[3px] border-radish shadow-float";
  const key = (which: "min" | "max") => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0; // RTL: left = more
    if (d) { e.preventDefault(); set(which, (which === "min" ? lo : hi) + d); }
  };
  return (
    <div className="flex flex-col gap-1">
      <div ref={track} onPointerDown={onDown} onPointerMove={(e) => drag.current && set(drag.current, valAt(e.clientX))}
        onPointerUp={() => (drag.current = null)} className="relative h-9 cursor-pointer touch-none">
        <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-line" />
        <div className="absolute top-4 h-1 rounded-full bg-radish" style={{ right: `${pct(lo)}%`, left: `${100 - pct(hi)}%` }} />
        <div role="slider" tabIndex={0} aria-label="حداقل قیمت" aria-valuemin={0} aria-valuemax={bound} aria-valuenow={lo}
          onKeyDown={key("min")} className={`${thumb} bg-card`} style={{ right: `${pct(lo)}%` }} />
        <div role="slider" tabIndex={0} aria-label="حداکثر قیمت" aria-valuemin={0} aria-valuemax={bound} aria-valuenow={hi}
          onKeyDown={key("max")} className={`${thumb} bg-radish`} style={{ right: `${pct(hi)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-stem"><span>۰</span><span>{priceShort(bound)}</span></div>
    </div>
  );
}

function MoneyInput({ label, value, onCommit, active }:
  { label: string; value: number | null; onCommit: (v: number | null) => void; active: boolean }) {
  const [text, setText] = useState(value ? faNum(value) : ""); // remounted (key) when the slider moves
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-stem">{label}</span>
      <span className={`flex h-[46px] items-center gap-1.5 rounded-button border-[1.5px] px-3 ${active ? "border-radish" : "border-line"}`}>
        <input value={text} inputMode="numeric" aria-label={label}
          onChange={(e) => { const n = parseDigits(e.target.value); setText(n ? faNum(n) : ""); }}
          onBlur={() => onCommit(parseDigits(text))}
          onKeyDown={(e) => e.key === "Enter" && onCommit(parseDigits(text))}
          className="tabular w-0 min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" placeholder="—" />
        <span className="text-[11.5px] text-stem">تومان</span>
      </span>
    </label>
  );
}

function Toggle({ label, sub, on, onClick }: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 border-b border-line py-1 text-start">
      <span className="flex flex-1 flex-col">
        <span className="text-[14.5px] font-medium">{label}</span>
        {sub && <span className="text-[11.5px] leading-[1.6] text-stem">{sub}</span>}
      </span>
      <span className={`relative h-7 w-[46px] flex-none rounded-full transition-colors ${on ? "bg-radish" : "bg-leader"}`}>
        <span className={`absolute top-[3px] size-[22px] rounded-full bg-card shadow-hair transition-[inset-inline-start] ${on ? "start-[21px]" : "start-[3px]"}`} />
      </span>
    </button>
  );
}

function ChoiceChip({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled}
      className={`hit flex h-[38px] items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13.5px] disabled:opacity-50 ${
        on ? "border-radish bg-radish-tint font-semibold" : "border-line bg-card"}`}>
      {on && <Check size={12} color="var(--color-radish)" sw={3.2} />}{label}
    </button>
  );
}

/** Mount only while open: the draft starts from `applied` on each opening. */
export function FilterSheet({ open, onClose, q, applied, ctx, data, originLabel, onApply }: {
  open: boolean; onClose: () => void; q: string; applied: Filters; ctx: Ctx; data: SearchOut;
  originLabel: string | null; onApply: (f: Filters) => void;
}) {
  const loc = useApp((s) => s.location);
  const [d, setD] = useState<Filters>(applied);
  const [brandQ, setBrandQ] = useState("");
  const patch = (p: Partial<Filters>) => setD((x) => ({ ...x, ...p }));
  const togglePay = (k: string) => patch({ pay: d.pay.includes(k) ? d.pay.filter((x) => x !== k) : [...d.pay, k] });

  const debounced = useDebounced(d);
  const live = useQuery({
    queryKey: ["search-count", q, debounced, ctx, loc?.lat, loc?.lng],
    queryFn: () => api<SearchOut>("/search", draftParams(q, debounced, ctx, loc)),
    enabled: open, placeholderData: (prev) => prev,
  });
  const pending = live.isFetching || debounced !== d;
  const n = live.data?.total ?? data.total;
  const bound = data.price_bounds?.max || 100_000_000;
  const brands = (live.data?.facets?.brand ?? data.facets?.brand ?? [])
    .filter((b) => !brandQ.trim() || b.label.toLowerCase().includes(brandQ.trim().toLowerCase()));
  const selectedExtra = d.brand.filter((b) => !brands.some((x) => x.key === b));
  const cats = data.facets?.category ?? [];
  const hasOrigin = !!originLabel;

  return (
    <BottomSheet open={open} onClose={onClose} title="همه فیلترها" top={64}
      action={<button type="button" onClick={() => setD({ ...d, ...CLEARED })} className="hit px-0.5 py-2 text-[13.5px] font-semibold text-radish">پاک کردن همه</button>}
      footer={
        <button type="button" disabled={!pending && n === 0} onClick={() => { onApply(d); onClose(); }}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-button bg-radish text-base font-bold text-white disabled:bg-line disabled:text-stem">
          {pending ? <><Glasses width={26} color="#FFFFFF" blink />اعمال</> : n > 0 ? `اعمال (${faNum(n)} نتیجه)` : "نتیجه‌ای نیست؛ یک فیلتر را بردار"}
        </button>
      }>
      <section className="flex flex-col gap-3.5 pt-1">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[15px] font-bold">قیمت</h3>
          <span className="text-[11.5px] text-stem">قیمت ثبت‌شده در فروشگاه، به تومان</span>
        </div>
        <PriceRange bound={bound} min={d.min} max={d.max} onChange={(min, max) => patch({ min, max })} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <MoneyInput key={`min-${d.min}`} label="حداقل" value={d.min} active={d.min != null} onCommit={(v) => patch({ min: v || null })} />
          <span className="flex h-[46px] items-center text-[13px] text-stem">تا</span>
          <MoneyInput key={`max-${d.max}`} label="حداکثر" value={d.max} active={d.max != null} onCommit={(v) => patch({ max: v || null })} />
        </div>
      </section>

      <section className="flex flex-col pt-3">
        <h3 className="mb-1.5 text-[15px] font-bold">پرداخت و ساعت</h3>
        <Toggle label="اقساطی" sub="فقط فروشنده‌هایی که اقساط را ثبت کرده‌اند" on={d.pay.includes("installments")} onClick={() => togglePay("installments")} />
        <Toggle label="ترب‌پی" on={d.pay.includes("torob_pay")} onClick={() => togglePay("torob_pay")} />
        <Toggle label="کالابرگ" on={d.pay.includes("kala_barg")} onClick={() => togglePay("kala_barg")} />
        <Toggle label="ارسال فوری" on={d.fast} onClick={() => patch({ fast: !d.fast })} />
        <Toggle label="الان باز" sub="بر اساس ساعت کاری ثبت‌شده" on={d.open} onClick={() => patch({ open: !d.open })} />
        <Toggle label="وضعیت نامشخص را هم نشان بده" sub="فروشنده‌هایی که این موارد را ثبت نکرده‌اند، با برچسب «؟»"
          on={d.unk} onClick={() => patch({ unk: !d.unk })} />
      </section>

      <section className="flex flex-col gap-2.5 pt-3">
        <h3 className="text-[15px] font-bold">{hasOrigin ? `فاصله از ${originLabel}` : "فاصله"}</h3>
        {!hasOrigin && <p className="text-xs text-stem">برای فیلتر فاصله، اول از صفحه‌ی خانه موقعیتت را انتخاب کن.</p>}
        <div className="flex flex-wrap gap-2">
          {[1, 3, 5, 10].map((km) => (
            <ChoiceChip key={km} disabled={!hasOrigin} on={d.radius === km} label={`${faNum(km)} کیلومتر`} onClick={() => patch({ radius: km })} />
          ))}
          <ChoiceChip disabled={!hasOrigin} on={d.radius == null} label="همه" onClick={() => patch({ radius: null })} />
        </div>
      </section>

      {cats.length > 1 && (
        <section className="flex flex-col gap-2.5 pt-3">
          <h3 className="text-[15px] font-bold">دسته</h3>
          <div className="flex flex-wrap gap-2">
            <ChoiceChip on={!d.cat} label="همه" onClick={() => patch({ cat: null })} />
            {cats.slice(0, 8).map((c) => (
              <ChoiceChip key={c.key} on={d.cat === c.key} label={`${c.label} (${faNum(c.count)})`} onClick={() => patch({ cat: c.key })} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5 pt-3 pb-2">
        <h3 className="text-[15px] font-bold">برند</h3>
        <label className="flex h-11 items-center gap-2.5 rounded-button border border-line bg-flesh px-3">
          <Glasses width={22} color="var(--color-stem)" />
          <input value={brandQ} onChange={(e) => setBrandQ(e.target.value)} placeholder="جست‌وجوی برند"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stem" />
        </label>
        <div className="flex flex-col">
          {[...selectedExtra.map((b) => ({ key: b, label: b, count: 0 })), ...brands].map((b) => {
            const on = d.brand.includes(b.key);
            return (
              <button key={b.key} type="button" role="checkbox" aria-checked={on}
                onClick={() => patch({ brand: on ? d.brand.filter((x) => x !== b.key) : [...d.brand, b.key] })}
                className="flex h-12 items-center gap-3 border-b border-line text-start">
                <span className={`flex size-[22px] flex-none items-center justify-center rounded-md border-[1.5px] ${on ? "border-radish bg-radish" : "border-leader bg-card"}`}>
                  {on && <Check size={13} color="#FFFFFF" sw={3.4} />}
                </span>
                <bdi className="flex-1 text-[14.5px] font-medium">{b.label}</bdi>
                {b.count > 0 && <span className="text-xs text-stem">{faNum(b.count)} کالا</span>}
              </button>
            );
          })}
          {!brands.length && !selectedExtra.length && (
            <p className="flex h-12 items-center text-[13px] text-stem">برندی با این نام در نتیجه‌ها نیست.</p>
          )}
        </div>
      </section>
    </BottomSheet>
  );
}
