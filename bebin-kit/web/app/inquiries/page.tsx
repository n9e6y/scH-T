"use client";
// F10 Follow-ups (Bebin Inquiry.dc.html #16): grouped by product, radish dots for unread replies, filter chips.
import Link from "next/link";
import { Suspense, useState } from "react";
import { BottomNav } from "@/components/chrome";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/inquiry";
import { ImageBox, modelLine } from "@/components/product-grid-card";
import { Glasses } from "@/components/brand";
import { faNum, timeFa } from "@/lib/format";
import { useInquiries, useLiveState } from "@/lib/live";

const FILTERS = [["all", "همه"], ["waiting", "منتظر"], ["answered", "جواب داد"], ["no_answer", "جواب نداد"]] as const;
type F = (typeof FILTERS)[number][0];

function FollowUps() {
  const q = useInquiries();
  const connected = useLiveState((s) => s.connected);
  const [f, setF] = useState<F>("all");
  const d = q.data;
  const match = (o: string) => f === "all" || (f === "waiting" ? o === "waiting" : f === "answered" ? o === "answered" || o === "out_of_stock" : o === f);
  const groups = (d?.groups ?? []).map((g) => ({ ...g, rows: g.items.filter((i) => match(i.outcome)) })).filter((g) => g.rows.length);

  if (d && !d.groups.length) {
    return (
      <div className="flex h-dvh flex-col">
        <EmptyState title="هنوز از فروشگاهی نپرسیدی"
          body="وقتی قیمت یا موجودی را از فروشنده بپرسی، جوابش اینجا با ساعت دقیق می‌آید."
          action={{ label: "یک کالا پیدا کن", href: "/" }} />
        <BottomNav />
      </div>
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none items-baseline justify-between px-5 pt-1.5 pb-3">
        <h1 className="text-2xl font-extrabold">پیگیری‌ها</h1>
        {!connected ? (
          <span className="flex items-center gap-1.5 text-[11px] text-stem"><Glasses width={18} blink />در حال اتصال دوباره…</span>
        ) : !!d?.unread && <span className="text-[12.5px] text-stem">{faNum(d.unread)} پاسخ تازه</span>}
      </header>
      <div className="no-scrollbar flex flex-none gap-1.5 overflow-x-auto px-4 pb-3">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}
            className={`hit flex h-9 flex-none items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] ${f === k ? "border-radish bg-radish-tint font-bold" : "border-line bg-card"}`}>
            {l}<span className="text-[11.5px] text-stem">{faNum(d?.counts[k] ?? 0)}</span>
          </button>
        ))}
      </div>
      <main className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
        {!d && <div className="flex justify-center py-10"><Glasses width={44} blink /></div>}
        {groups.map((g) => {
          const model = g.product ? modelLine(g.product.title, g.product.model) : null;
          return (
            <section key={g.product?.id ?? g.rows[0].shop.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 px-1">
                <ImageBox src={g.product?.image} className="size-9 flex-none rounded-lg border border-line p-0.5" />
                <div className="flex min-w-0 flex-1 flex-col">
                  {model ? <bdi dir="ltr" className="block truncate text-start text-sm font-bold">{model}</bdi>
                    : <span className="truncate text-sm font-bold">{g.product?.title ?? "پیام به فروشگاه"}</span>}
                  <span className="text-[11.5px] text-stem">{faNum(g.items.length)} پیگیری</span>
                </div>
              </div>
              <div className="flex-none overflow-hidden rounded-card bg-card">
                {g.rows.map((r) => (
                  <Link key={r.id} href={`/inquiries/${r.id}`} className="flex flex-col gap-1.5 border-b border-line px-3.5 py-3 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[14.5px] ${r.unread ? "font-bold" : "font-medium"}`}>{r.shop.name}</span>
                      {r.unread && <span className="size-2 rounded-full bg-radish" aria-label="تازه" />}
                      <span className="flex-1" />
                      <span className="text-[11.5px] text-stem">{timeFa(r.updated_at)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip inq={r} />
                      <span className={`text-xs leading-[1.6] ${r.outcome === "out_of_stock" ? "font-bold text-beet" : "text-stem"}`}>{r.preview}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
        {d && !groups.length && <p className="px-2 py-8 text-center text-[13px] text-stem">در این دسته پیگیری‌ای نیست.</p>}
      </main>
      <BottomNav />
    </div>
  );
}

export default function InquiriesPage() {
  return <Suspense><FollowUps /></Suspense>;
}
