"use client";
// F9 Mall page (Bebin Store.dc.html #14): header with open count, search, floor chips, directory by floor;
// sticky «مسیر تا پاساژ». Open counts come from listed hours.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Glasses } from "@/components/brand";
import { BottomNav } from "@/components/chrome";
import { ChevronForward, Moon, Route } from "@/components/icons";
import { api, type MallDetail } from "@/lib/api";
import { distance, duration, faDigits, faNum } from "@/lib/format";
import { directionsUrl } from "@/lib/place";
import { normalizeFa } from "@/lib/text";
import { useApp } from "@/lib/store";

function MallPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const highlight = sp.get("shop");
  const [q, setQ] = useState("");
  const [floor, setFloor] = useState<string | null>(null);
  const m = useQuery({
    queryKey: ["mall", Number(id), loc?.lat, loc?.lng],
    queryFn: () => api<MallDetail>(`/malls/${id}`, { lat: loc?.lat, lng: loc?.lng }),
  });
  const d = m.data;
  const nq = normalizeFa(q.trim());
  const groups = (d?.floors ?? []).map((f) => ({
    ...f,
    open: f.shops.filter((s) => s.open_status.state === "open" || s.open_status.state === "closing_soon").length,
    hits: f.shops.filter((s) => !nq || normalizeFa(`${s.name} ${s.primary_category ?? ""}`).includes(nq)),
  }));
  const shown = groups.filter((g) => g.hits.length && (!floor || g.floor_label === floor));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none flex-col gap-2 border-b border-line bg-card px-5 pt-1 pb-4">
        <div className="-ms-2 flex items-center gap-1.5">
          <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="برگشت" className="flex h-11 w-10 flex-none items-center justify-center">
            <ChevronForward size={22} className="rotate-180" />
          </button>
          <h1 className="text-xl font-extrabold">{d?.name ?? "…"}</h1>
        </div>
        {d && (
          <>
            <span className="text-[12.5px] leading-[1.7] text-stem">
              {faDigits([d.address, distance(d.distance_m), d.eta_min != null && `${duration(d.eta_min)} پیاده، تخمینی`].filter(Boolean).join("، "))}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-leaf-tint px-2.5 text-xs font-semibold text-leaf-ink">
                <span className="size-[7px] rounded-full bg-leaf-ink" />{faNum(d.open_count)} فروشگاه باز از {faNum(d.shop_count)}
              </span>
              <span className="text-[11.5px] text-stem">بر اساس ساعت ثبت‌شده</span>
            </div>
          </>
        )}
      </header>
      <div className="flex flex-none flex-col gap-2.5 bg-flesh px-4 pt-3 pb-2">
        <label className="flex h-[46px] items-center gap-2.5 rounded-button border-[1.5px] border-soil bg-card px-3">
          <Glasses width={24} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در پاساژ: فروشگاه یا دسته"
            className="w-0 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stem" />
        </label>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {[{ floor_label: null as string | null, shops: d?.floors.flatMap((f) => f.shops) ?? [] }, ...(d?.floors ?? [])].map((f) => {
            const on = floor === f.floor_label;
            return (
              <button key={f.floor_label ?? "all"} type="button" aria-pressed={on} onClick={() => setFloor(f.floor_label)}
                className={`hit flex h-[34px] flex-none items-center gap-[5px] rounded-full border-[1.5px] px-3 text-[12.5px] whitespace-nowrap ${on ? "border-radish bg-radish-tint font-bold" : "border-line bg-card"}`}>
                {f.floor_label ? faDigits(f.floor_label) : "همه"}
                {f.floor_label && <span className="text-[11px] text-stem">{faNum(f.shops.length)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <main className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-6">
        {!d && <div className="h-64 rounded-card bg-card" aria-busy />}
        {shown.map((g) => (
          <section key={g.floor_label} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 px-1">
              <h2 className="text-[14.5px] font-bold">{faDigits(g.floor_label)}</h2>
              <span className="text-[11.5px] text-stem">{faNum(g.open)} باز از {faNum(g.shops.length)} در فهرست</span>
            </div>
            <div className="overflow-hidden rounded-card bg-card">
              {g.hits.map((s) => (
                <Link key={s.id} href={`/shop/${s.id}`}
                  className={`flex min-h-[54px] items-center gap-2.5 border-b border-line px-3.5 last:border-b-0 ${s.id === highlight ? "bg-radish-tint" : ""}`}>
                  <span className="w-[38px] flex-none text-[11.5px] text-stem">{s.unit ? faDigits(s.unit) : "—"}</span>
                  <div className="flex min-w-0 flex-1 flex-col py-1.5">
                    <span className={`text-[13.5px] ${s.id === highlight ? "font-bold" : "font-medium"}`}>{s.name}</span>
                    {s.primary_category && <span className="text-[11.5px] text-stem">{s.primary_category}</span>}
                  </div>
                  {s.open_status.state === "open" || s.open_status.state === "closing_soon" ? (
                    <span className="flex items-center gap-[5px] text-[11.5px] font-semibold whitespace-nowrap text-leaf-ink"><span className="size-[7px] rounded-full bg-leaf-ink" />باز</span>
                  ) : s.open_status.state === "closed" ? (
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap text-beet"><Moon size={12} />بسته</span>
                  ) : (
                    <span className="flex h-[22px] items-center gap-[3px] rounded-full border-[1.5px] border-dashed border-ash px-2 text-[11px] whitespace-nowrap text-stem"><b>؟</b>ساعت</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
        {d && !shown.length && <p className="px-2 py-6 text-center text-[13px] leading-[1.8] text-stem">فروشگاهی با این نام یا دسته در فهرست این پاساژ نیست.</p>}
      </main>
      {d && (
        <div className="flex flex-none border-t border-line bg-card px-4 py-2.5">
          <a href={directionsUrl(d.lat, d.lng)} target="_blank" rel="noopener"
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-button bg-radish text-[15.5px] font-bold text-white">
            <Route size={18} color="#FFFFFF" />مسیر تا پاساژ
          </a>
        </div>
      )}
      <BottomNav />
    </div>
  );
}

export default function MallRoute() {
  return <Suspense><MallPage /></Suspense>;
}
