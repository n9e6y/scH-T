"use client";
// «داخل پاساژ پیدایش کن» (Bebin Store.dc.html 13a known / 13b unknown). The unit strip uses the shop's real
// neighbours on that floor as landmarks; with no floor/unit on record everything is dashed and the action is to ask.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type MallDetail, type OpenStatus, type S } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { duration, faDigits } from "@/lib/format";
import { directionsUrl } from "@/lib/place";
import { useApp } from "@/lib/store";
import { Route } from "./icons";

type ShopRef = S["ShopRef"];

function Tile({ label, value, unknown }: { label: string; value: string | null; unknown?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col rounded-button px-3 py-2.5 ${unknown ? "border-[1.5px] border-dashed border-ash" : "bg-flesh"}`}>
      <span className="text-[11.5px] text-stem">{label}</span>
      <span className={`text-xl font-extrabold ${unknown ? "text-stem" : ""}`}>{unknown ? "؟" : faDigits(value ?? "")}</span>
    </div>
  );
}

export function InMallCard({ shop, open }: { shop: ShopRef; open: OpenStatus }) {
  const loc = useApp((s) => s.location);
  const openComposer = useComposer((s) => s.open);
  const l = shop.location;
  const mallId = l.mall?.id;
  const mall = useQuery({
    queryKey: ["mall", mallId, loc?.lat, loc?.lng],
    queryFn: () => api<MallDetail>(`/malls/${mallId}`, { lat: loc?.lat, lng: loc?.lng }),
    enabled: mallId != null,
  });
  const floors = mall.data?.floors ?? [];
  const homeIdx = floors.findIndex((f) => f.shops.some((s) => s.id === shop.id));
  const [pick, setPick] = useState<number | null>(null);
  const fIdx = pick ?? (homeIdx >= 0 ? homeIdx : 0);
  const floor = floors[fIdx];
  if (!l.mall) return null;
  const known = l.state === "known";
  const eta = duration(mall.data?.eta_min);

  if (!known) {
    return (
      <div className="flex flex-col gap-3.5 rounded-card bg-card p-4 shadow-float">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold">داخل پاساژ پیدایش کن</h3><span className="text-xs text-stem">{l.mall.name}</span></div>
        <div className="flex gap-2.5"><Tile label="طبقه" value={null} unknown /><Tile label="واحد" value={null} unknown /></div>
        <span className="flex h-7 items-center gap-[5px] self-start rounded-full border-[1.5px] border-dashed border-ash px-2.5 text-xs text-stem"><b>؟</b>طبقه و واحد ثبت نشده</span>
        <button type="button" onClick={() => openComposer({ productId: null, productTitle: null, shops: [{ id: shop.id, name: shop.name, open }], preset: ["location"] })}
          className="flex h-[50px] items-center justify-center gap-2 rounded-button bg-radish text-[15px] font-bold text-white">
          از فروشنده بپرس دقیقاً کجاست
        </button>
        <a href={directionsUrl(shop.lat, shop.lng)} target="_blank" rel="noopener"
          className="flex h-11 items-center justify-center rounded-button border-[1.5px] border-radish text-[13.5px] font-bold text-radish">
          مسیر تا {l.mall.name}
        </a>
      </div>
    );
  }

  // Up to ten neighbouring units around the target, as two facing rows of a corridor.
  const units = [...(floor?.shops ?? [])].filter((s) => s.unit).sort((a, b) => (a.unit ?? "").localeCompare(b.unit ?? "", "en", { numeric: true }));
  const at = units.findIndex((s) => s.id === shop.id);
  const start = Math.max(0, Math.min((at >= 0 ? at : 0) - 4, units.length - 10));
  const win = units.slice(start, start + 10);
  const top = win.filter((_, i) => i % 2 === 0), bottom = win.filter((_, i) => i % 2 === 1);
  const here = floor && fIdx === homeIdx;
  const left = at > 0 ? units[at - 1] : null, right = at >= 0 && at < units.length - 1 ? units[at + 1] : null;
  const note = here
    ? left && right ? `${shop.name} بین «${left.name}» و «${right.name}» است.` : `${shop.name} در همین طبقه است.`
    : floor ? `${shop.name} در این طبقه نیست؛ به ${floors[homeIdx]?.floor_label ?? l.floor_label} برو.` : "";

  const Unit = ({ s }: { s: (typeof units)[number] }) => {
    const target = s.id === shop.id;
    return (
      <div className={`flex h-[62px] min-w-0 flex-1 flex-col items-center justify-center gap-px rounded-md border-[1.5px] px-0.5 ${target ? "border-radish bg-radish text-white" : "border-leader bg-card"}`}>
        <span className={`text-[11px] ${target ? "font-extrabold" : "font-semibold"}`}>{faDigits(s.unit ?? "")}</span>
        <span className={`max-w-full truncate text-[9.5px] leading-[1.4] ${target ? "text-white" : "text-stem"}`}>{s.name}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-card bg-card p-4 shadow-float">
      <div className="flex items-center justify-between"><h3 className="text-base font-bold">داخل پاساژ پیدایش کن</h3><span className="text-xs text-stem">{l.mall.name}</span></div>
      <div className="flex gap-2.5">
        <Tile label="طبقه" value={l.floor_label?.replace(/^طبقه\s*/, "") ?? null} unknown={!l.floor_label} />
        <Tile label="واحد" value={l.unit ?? null} unknown={!l.unit} />
      </div>
      {floors.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {floors.map((f, i) => (
            <button key={f.floor_label} type="button" aria-pressed={i === fIdx} onClick={() => setPick(i)}
              className={`hit flex h-8 flex-none items-center rounded-full border-[1.5px] px-3 text-[12.5px] ${i === fIdx ? "border-radish bg-radish-tint font-bold" : "border-line bg-card"}`}>
              {faDigits(f.floor_label)}
            </button>
          ))}
        </div>
      )}
      {!!win.length && (
        <div className="flex flex-col gap-1.5" aria-label={`واحدهای ${floor?.floor_label ?? ""}`}>
          <div className="flex gap-1">{top.map((s) => <Unit key={s.id} s={s} />)}</div>
          <div className="flex h-[30px] items-center justify-center rounded-md bg-flesh text-[11px] text-stem">راهرو</div>
          <div className="flex gap-1">{bottom.map((s) => <Unit key={s.id} s={s} />)}</div>
        </div>
      )}
      {note && <p className="text-xs leading-[1.7] text-stem">{note}</p>}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <a href={directionsUrl(shop.lat, shop.lng)} target="_blank" rel="noopener"
          className="flex h-[50px] items-center justify-center gap-2 rounded-button bg-radish text-[15px] font-bold text-white">
          <Route size={18} color="#FFFFFF" />مسیر تا پاساژ
        </a>
        {eta && <span className="flex h-[50px] items-center rounded-button border-[1.5px] border-line px-3.5 text-[13.5px] font-semibold">{eta} پیاده</span>}
      </div>
    </div>
  );
}
