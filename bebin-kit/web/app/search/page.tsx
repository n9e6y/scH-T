"use client";
// Interim results list (design prompt 3 not done yet): understood chips + board ProductCards + honest notices.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Glasses, Mascot } from "@/components/brand";
import { BottomNav } from "@/components/chrome";
import { ChevronForward, Close } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { api, type SearchOut } from "@/lib/api";
import { faNum } from "@/lib/format";
import { useApp } from "@/lib/store";

const PAY_LABEL: Record<string, string> = { installments: "اقساط", torob_pay: "ترب‌پی", kala_barg: "کالابرگ", open: "ساعت کاری" };

function Results() {
  const params = useSearchParams();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const q = params.get("q") ?? "";
  const cat = params.get("cat");
  const [text, setText] = useState(q);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["search", q, cat, loc?.lat, loc?.lng],
    queryFn: () => api<SearchOut>("/search", { q, cat, lat: loc?.lat, lng: loc?.lng }),
  });
  const unknown = Object.entries(data?.excluded_unknown ?? {});

  return (
    <div className="flex h-dvh flex-col">
      <form role="search" className="flex flex-none items-center gap-2 px-4 pt-3 pb-2"
        onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(text.trim())}`); }}>
        <Link href="/" aria-label="برگشت" className="flex size-11 flex-none items-center justify-center">
          <ChevronForward size={22} className="rotate-180" />
        </Link>
        <label className="flex h-12 flex-1 items-center gap-3 rounded-button border-[1.5px] border-soil bg-card px-3.5">
          <Glasses width={28} />
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="جست‌وجوی کالا" enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none" placeholder="چی می‌خوای؟" />
        </label>
      </form>
      {!!data?.understood_chips.length && (
        <div className="no-scrollbar flex flex-none items-center gap-2 overflow-x-auto px-4 pb-2">
          <span className="flex-none text-xs text-stem">این‌طور فهمیدم:</span>
          {data.understood_chips.map((c) => (
            <span key={`${c.key}-${c.value}`} className="flex h-8 flex-none items-center gap-1 rounded-full border-[1.5px] border-radish bg-radish-tint ps-3 pe-2 text-[13px]">
              {c.label}<Close size={12} color="var(--color-stem)" />
            </span>
          ))}
        </div>
      )}
      <main className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-6">
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-stem"><Glasses width={30} blink />در حال گشتن…</div>
        )}
        {isError && (
          <div className="flex flex-col items-start gap-2 rounded-card bg-beet-tint p-4 text-sm text-beet">
            جست‌وجو انجام نشد.
            <button type="button" onClick={() => refetch()} className="min-h-11 font-bold text-radish">دوباره امتحان کن</button>
          </div>
        )}
        {data && (
          <span className="text-caption text-stem">{faNum(data.total)} کالا در فهرست فروشگاه‌ها</span>
        )}
        {unknown.map(([k, n]) => (
          <div key={k} className="rounded-card border-[1.5px] border-dashed border-ash px-3.5 py-2.5 text-[13px] text-stem">
            {faNum(n)} کالا با وضعیت {PAY_LABEL[k] ?? k} نامشخص کنار گذاشته شد.
          </div>
        ))}
        {data?.items.map((p) => <ProductCard key={p.id} p={p} />)}
        {data && !data.items.length && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Mascot pose="confused" scale={4} />
            <h2 className="font-display text-[26px]">چیزی پیدا نکردم</h2>
            {data.relax && <p className="text-sm text-stem">پیشنهاد: {data.relax.label}</p>}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><Results /></Suspense>;
}
