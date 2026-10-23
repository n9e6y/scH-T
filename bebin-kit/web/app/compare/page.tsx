"use client";
// F6 Compare (Bebin Product.dc.html #11): two-axis scroll, headers stick to the top and labels to the right;
// a soil dot + bold marks a row's leader (no good/bad colours); unknown is dashed «؟ نامشخص».
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BottomNav } from "@/components/chrome";
import { Close, ChevronForward } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { ImageBox } from "@/components/product-grid-card";
import { api, type CompareOut } from "@/lib/api";
import { faNum, faText } from "@/lib/format";
import { useApp } from "@/lib/store";

type Row = CompareOut["specs"][number];

function Cell({ v, lead, ltr }: { v: string | null | undefined; lead: boolean; ltr?: boolean }) {
  return (
    <div className="flex w-[155px] flex-none items-start gap-1.5 border-e border-line px-2.5 py-3">
      {v ? (
        <>
          {lead && <span className="mt-2 size-[7px] flex-none rounded-full bg-soil" aria-label="بهترین در این ردیف" />}
          <span dir={ltr || /[A-Za-z]/.test(v) ? "ltr" : undefined} className={`text-[12.5px] leading-[1.7] ${lead ? "font-bold" : ""}`}>{faText(v)}</span>
        </>
      ) : (
        <span className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-dashed border-ash px-[9px] text-[11.5px] text-stem"><b>؟</b>نامشخص</span>
      )}
    </div>
  );
}

function Compare() {
  const sp = useSearchParams();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const removeCompare = useApp((s) => s.removeCompare);
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  const [diffOnly, setDiffOnly] = useState(false);
  const q = useQuery({
    queryKey: ["compare", ids.join(","), loc?.lat, loc?.lng],
    queryFn: () => api<CompareOut>("/compare", undefined, { method: "POST", body: JSON.stringify({ ids, lat: loc?.lat, lng: loc?.lng }) }),
    enabled: ids.length >= 2,
  });
  const remove = (id: string) => {
    removeCompare(id);
    const rest = ids.filter((x) => x !== id);
    router.replace(rest.length ? `/compare?ids=${rest.join(",")}` : "/compare");
  };

  if (ids.length < 2) {
    return (
      <div className="flex h-dvh flex-col">
        <EmptyState pose="default" title="برای مقایسه دو کالا لازم است"
          body="در نتیجه‌های جست‌وجو روی «مقایسه» بزن تا کالا اینجا بیاید؛ تا ۳ کالا را کنار هم می‌بینی."
          action={{ label: "برو به جست‌وجو", href: "/" }} />
        <BottomNav />
      </div>
    );
  }
  const d = q.data;
  const rows: Row[] = d ? [...(d.summary ?? []), ...d.specs.filter((r) => !diffOnly || r.differs)] : [];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none items-center gap-2 border-b border-line bg-card ps-4 pe-3 pt-0.5 pb-2.5">
        <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="برگشت" className="flex h-11 w-10 flex-none items-center justify-center">
          <ChevronForward size={22} className="rotate-180" />
        </button>
        <h1 className="flex-1 text-[17px] font-bold">مقایسه {faNum(ids.length)} کالا</h1>
        <button type="button" role="switch" aria-checked={diffOnly} onClick={() => setDiffOnly((v) => !v)} className="flex items-center gap-2 py-2 text-[12.5px]">
          فقط تفاوت‌ها
          <span className={`relative h-6 w-10 flex-none rounded-full transition-colors ${diffOnly ? "bg-radish" : "bg-leader"}`}>
            <span className={`absolute top-[3px] size-[18px] rounded-full bg-card shadow-hair transition-[inset-inline-start] ${diffOnly ? "start-[19px]" : "start-[3px]"}`} />
          </span>
        </button>
      </header>
      <main className="no-scrollbar relative flex-1 overflow-auto">
        {!d ? (
          <div className="m-4 h-72 rounded-card bg-card" aria-busy />
        ) : (
          <div className="flex w-max min-w-full flex-col">
            <div className="sticky top-0 z-[3] flex border-b border-line bg-card">
              <div className="sticky start-0 z-[4] flex w-[100px] flex-none items-end border-e border-line bg-card p-3 text-[11.5px] text-stem">قیمت‌ها: ثبت‌شده</div>
              {d.columns.map((c) => (
                <div key={c.id} className="relative flex w-[155px] flex-none flex-col gap-1 border-e border-line px-2.5 py-3">
                  <button type="button" onClick={() => remove(c.id)} aria-label="حذف از مقایسه"
                    className="hit absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-flesh">
                    <Close size={12} color="var(--color-stem)" />
                  </button>
                  <ImageBox src={c.image} className="size-[52px] rounded-[10px] border border-line p-0.5" />
                  <Link href={`/product/${c.id}`} className="mt-1 line-clamp-3 text-[12.5px] leading-[1.5] font-bold">{c.title}</Link>
                  {c.brand && <bdi className="text-[11px] text-stem">{c.brand}</bdi>}
                  <div className="flex min-h-6 flex-wrap gap-1">
                    {c.best_for.map((b) => (
                      <span key={b} className="flex h-[22px] items-center rounded-full bg-radish-tint px-2 text-[10.5px] font-bold whitespace-nowrap">{b}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex border-b border-line bg-card">
                <div className="sticky start-0 z-[2] w-[100px] flex-none border-e border-line bg-flesh p-3 text-xs leading-[1.6] text-stem">{r.key}</div>
                {r.values.map((v, i) => <Cell key={i} v={v} lead={r.leader === i} ltr={r.ltr} />)}
              </div>
            ))}
            <div className="flex bg-card">
              <div className="sticky start-0 z-[2] w-[100px] flex-none border-e border-line bg-flesh p-3 text-xs font-bold">خلاصه</div>
              {d.columns.map((c) => (
                <div key={c.id} className="flex w-[155px] flex-none flex-col gap-2.5 border-e border-line px-2.5 pt-3 pb-4">
                  <span className="text-[12.5px] leading-[1.75] [text-wrap:pretty]">{c.verdict ?? "—"}</span>
                  <Link href={`/product/${c.id}/sellers`} className="mt-auto flex h-10 items-center justify-center rounded-button border-[1.5px] border-radish text-[13px] font-bold text-radish">
                    فروشنده‌ها
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export default function ComparePage() {
  return <Suspense><Compare /></Suspense>;
}
