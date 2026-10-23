"use client";
// F16 About & settings (Bebin Seller and System.dc.html #23): lockups, data date, coverage, caveats, wipe,
// and the demo director in its own dashed box so it never reads as a real setting.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BottomNav } from "@/components/chrome";
import { ChevronForward, Info } from "@/components/icons";
import { api, type DemoState, type Meta } from "@/lib/api";
import { useChat } from "@/lib/chat";
import { faNum, jalaliDate } from "@/lib/format";
import { useApp } from "@/lib/store";

const OUTCOMES = [["answer", "موجود"], ["out_of_stock", "ناموجود"], ["no_answer", "بی‌پاسخ"], [null, "تصادفی"]] as const;
const CLOCKS = [[null, "اکنون واقعی"], ["2026-10-21T17:40:00", "چهارشنبه ۱۷:۴۰"], ["2026-10-23T20:30:00", "جمعه ۲۰:۳۰"], ["2026-10-24T09:30:00", "شنبه ۰۹:۳۰"]] as const;
const SPEEDS = [0.5, 1, 3, 10] as const;

function Seg<T>({ options, value, onChange, h = 34 }: { options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; h?: number }) {
  return (
    <div role="radiogroup" className="grid gap-[3px] rounded-[9px] bg-mist p-[3px]" style={{ height: h, gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([k, l]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`rounded-[7px] text-[11.5px] ${value === k ? "bg-card font-bold text-radish shadow-hair" : "text-stem"}`}>{l}</button>
      ))}
    </div>
  );
}

function Director() {
  const qc = useQueryClient();
  const demoClock = useApp((s) => s.demoClock);
  const setDemoClock = useApp((s) => s.setDemoClock);
  const plan = useApp((s) => s.plan);
  const state = useQuery({ queryKey: ["demo"], queryFn: () => api<DemoState>("/demo") });
  const inquiries = useQuery({ queryKey: ["inquiries"], queryFn: () => api<{ groups: { items: { shop: { id: string; name: string } }[] }[] }>("/inquiries") });
  const shops = new Map<string, string>();
  plan.forEach((p) => shops.set(p.shopId, p.shopName));
  inquiries.data?.groups.forEach((g) => g.items.forEach((i) => shops.set(i.shop.id, i.shop.name)));
  const list = [...shops].slice(0, 6);
  const override = useMutation({
    mutationFn: (v: { shop_id: string; outcome: string | null }) => api<DemoState>("/demo/override", undefined, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (d) => qc.setQueryData(["demo"], d),
  });
  const speed = useMutation({
    mutationFn: (s: number) => api<DemoState>("/demo/speed", { speed: s }, { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(["demo"], d),
  });
  const reset = () => {
    list.forEach(([id]) => override.mutate({ shop_id: id, outcome: null }));
    speed.mutate(1);
    setDemoClock(null);
  };
  const d = state.data;
  if (!d?.enabled) return null;
  const sp = d.speed;
  return (
    <section className="flex flex-none flex-col gap-3 rounded-card border-[1.5px] border-dashed border-stem p-3.5">
      <div className="flex items-center gap-2">
        <Info size={16} />
        <h2 className="flex-1 text-[15px] font-bold">کارگردان دمو</h2>
        <span className="flex h-6 items-center rounded-full border border-soil px-[9px] text-[11px] font-semibold">فقط برای نمایش</span>
      </div>
      <span className="text-[12.5px] font-semibold">پاسخ بعدی هر فروشگاه</span>
      {list.length ? (
        <div className="overflow-hidden rounded-button bg-card">
          {list.map(([id, name]) => (
            <div key={id} className="flex flex-col gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0">
              <span className="text-[13px] font-semibold">{name}</span>
              <Seg options={OUTCOMES} value={(d.overrides[id] ?? null) as (typeof OUTCOMES)[number][0]} onChange={(o) => override.mutate({ shop_id: id, outcome: o })} />
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-stem">فروشگاهی به برنامه اضافه کن یا از فروشگاهی بپرس تا اینجا بیاید.</p>}
      <span className="text-[12.5px] font-semibold">ساعت دمو</span>
      <div className="flex flex-wrap gap-1.5">
        {CLOCKS.map(([iso, l]) => {
          const on = (demoClock ?? null) === iso;
          return (
            <button key={l} type="button" aria-pressed={on} onClick={() => { setDemoClock(iso); qc.invalidateQueries(); }}
              className={`hit flex h-9 items-center rounded-full border-[1.5px] px-3 text-[12.5px] ${on ? "border-radish bg-radish-tint font-bold" : "border-line bg-card"}`}>{l}</button>
          );
        })}
      </div>
      <span className="text-[12.5px] font-semibold">سرعت شبیه‌ساز</span>
      <Seg options={SPEEDS.map((s) => [s, `${faNum(s)}×`] as const)} value={(SPEEDS as readonly number[]).includes(sp) ? sp : 1} onChange={(s) => speed.mutate(s)} h={38} />
      <span className="text-[11.5px] text-stem">پاسخ‌های شبیه‌سازی‌شده حدود {faNum(Math.round(8 / sp))} تا {faNum(Math.round(40 / sp))} ثانیه بعد می‌رسند؛ بی‌پاسخ بعد از {faNum(Math.round(90 / sp))} ثانیه.</span>
      <button type="button" onClick={reset} className="flex h-[42px] items-center justify-center rounded-button border-[1.5px] border-line bg-card text-[13.5px] font-semibold">بازنشانی دمو</button>
    </section>
  );
}

export default function AboutPage() {
  const router = useRouter();
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta"), staleTime: 60_000 });
  const [wiped, setWiped] = useState(false);
  const backup = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wipe = () => {
    if (wiped) { // undo within 10 seconds
      if (backup.current) localStorage.setItem("bebin", backup.current);
      if (timer.current) clearTimeout(timer.current);
      setWiped(false);
      location.reload();
      return;
    }
    backup.current = localStorage.getItem("bebin");
    const s = useApp.getState();
    useApp.setState({ compare: [], saved: [], plan: [], lastViewed: null, planOrdered: false, sessionId: s.sessionId });
    useChat.getState().reset();
    setWiped(true);
    timer.current = setTimeout(() => setWiped(false), 10_000);
  };
  const m = meta.data;
  const caveat = (k: string) => m?.caveats.find((c) => c.key === k)?.text_fa;
  return (
    <div className="flex h-dvh flex-col">
      <main className="no-scrollbar flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 pt-2 pb-6">
        <button type="button" onClick={() => router.back()} aria-label="برگشت" className="-ms-1 flex h-11 w-10 items-center justify-center"><ChevronForward size={22} className="rotate-180" /></button>
        <div className="flex flex-none flex-col items-center gap-3.5 rounded-card bg-card px-4 pt-6 pb-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-bilingual.svg" alt="ببین، look" className="h-16" />
          <div className="flex items-center gap-2 text-[12.5px] text-stem">از
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark-torob.svg" alt="torob" className="h-5" />
          </div>
          <span className="text-[11.5px] text-stem">نسخه‌ی نمایشی ۰٫۹</span>
        </div>
        <section className="flex flex-none flex-col gap-2">
          <h2 className="px-1 text-[15px] font-bold">داده‌ها</h2>
          <div className="overflow-hidden rounded-card bg-card">
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-3 text-[13px]">
              <span className="text-stem">تاریخ برداشت داده</span><span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
              <span className="font-bold">{m ? jalaliDate(m.snapshot_date, true) : "…"}</span>
            </div>
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-3 text-[13px]">
              <span className="text-stem">فروشگاه و کالا</span><span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
              <span className="font-bold">{m ? `${faNum(m.counts.shops ?? 0)} فروشگاه، ${faNum(m.counts.products ?? 0)} کالا` : "…"}</span>
            </div>
            <div className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-center gap-2 text-[13px]"><span className="text-stem">پوشش</span><span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-leader" /><span className="font-bold">حدود ۱۰٪ فروشگاه‌های تهران</span></div>
              <div className="relative h-2 overflow-hidden rounded bg-mist"><span className="absolute inset-y-0 start-0 w-[10%] rounded bg-soil" /></div>
              <span className="text-xs leading-[1.7] text-stem">{caveat("coverage")} {caveat("partial_inventory")}</span>
            </div>
          </div>
        </section>
        <section className="flex flex-none flex-col gap-2">
          <h2 className="px-1 text-[15px] font-bold">چیزهایی که باید بدانی</h2>
          <div className="overflow-hidden rounded-card bg-card">
            {[caveat("stock"), caveat("snapshot"), caveat("phones"), "پاسخ فروشنده‌ها شبیه‌سازی‌شده است و برچسب «پاسخ شبیه‌سازی‌شده» دارد. پنل فروشنده (/seller) راه رسیدن پاسخ واقعی است."]
              .filter(Boolean).map((t, i) => (
                <div key={i} className="flex items-start gap-2.5 border-b border-line px-3.5 py-3 last:border-b-0">
                  {i === 0 ? <span className="mt-px flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-ash text-[11px] font-bold text-stem">؟</span>
                    : <Info size={18} className="mt-0.5 flex-none" color="var(--color-stem)" />}
                  <span className="text-[13px] leading-[1.75]">{t}</span>
                </div>
              ))}
          </div>
        </section>
        <section className="flex flex-none flex-col gap-2">
          <h2 className="px-1 text-[15px] font-bold">حریم خصوصی</h2>
          <div className="flex flex-col gap-2.5 rounded-card bg-card p-3.5">
            <span className="text-[12.5px] leading-[1.75] text-stem">تاریخچه‌ی گفتگو، برنامه‌ها، ذخیره‌شده‌ها و سبد مقایسه فقط روی همین گوشی است.</span>
            <button type="button" onClick={wipe} className="flex h-[46px] items-center justify-center gap-2 rounded-button bg-beet-tint text-sm font-bold text-beet">
              {wiped ? "پاک شد، برگرداندن تا ۱۰ ثانیه" : "پاک کردن داده‌های من"}
            </button>
          </div>
        </section>
        <Director />
      </main>
      <BottomNav />
    </div>
  );
}
