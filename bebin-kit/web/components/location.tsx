"use client";
// F1 location setup pieces shared by onboarding and the location sheet (Bebin Screens: 1a, 1b, 3).
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Area } from "@/lib/api";
import { geolocate } from "@/lib/geolocate";
import { haversine, useAreas } from "@/lib/queries";
import { useApp, type UserLocation } from "@/lib/store";
import { normalizeFa } from "@/lib/text";
import { Glasses } from "./brand";
import { BottomSheet, useToasts } from "./chrome";
import { ChevronForward, MapIcon, Target } from "./icons";

const MapPicker = dynamic(() => import("./map-picker"), { ssr: false });

/** Name a GPS or map point after the nearest area preset when it's close, so the chip stays readable. */
export function nameFor(lat: number, lng: number, areas: Area[] | undefined, fallback: string): string {
  if (!areas?.length) return fallback;
  const near = areas.map((a) => ({ a, d: haversine({ lat, lng }, a) })).sort((x, y) => x.d - y.d)[0];
  return near.d < 1500 ? near.a.name : fallback;
}

export function areaToLocation(a: Area): UserLocation {
  return { kind: "area", name: a.name, lat: a.lat, lng: a.lng };
}

export function RadioRows({ areas, selected, current, onSelect }:
  { areas: Area[]; selected: string | null; current?: string | null; onSelect: (a: Area) => void }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
      {areas.map((a) => {
        const on = selected === a.name;
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => onSelect(a)}
            className={`flex h-12 items-center gap-3 px-3.5 text-start ${on ? "bg-radish-tint" : "bg-card"}`}>
            <span className={`size-5 flex-none rounded-full bg-card ${on ? "border-[6px] border-radish" : "border-[1.5px] border-ash-line"}`} />
            <span className={`flex-1 text-body ${on ? "font-bold" : ""}`}>{a.name}</span>
            {current === a.name && <span className="text-xs text-stem">انتخاب فعلی</span>}
          </button>
        );
      })}
    </div>
  );
}

export function useGps() {
  const { data: areas } = useAreas();
  const setLocation = useApp((s) => s.setLocation);
  const [busy, setBusy] = useState(false);
  const run = async (): Promise<"ok" | "denied" | "unavailable"> => {
    setBusy(true);
    const r = await geolocate();
    setBusy(false);
    if (!r.ok) return r.reason;
    setLocation({ kind: "gps", name: nameFor(r.lat, r.lng, areas, "موقعیت من"), lat: r.lat, lng: r.lng });
    return "ok";
  };
  return { run, busy };
}

export function useMapPick(onPicked?: () => void) {
  const { data: areas } = useAreas();
  const setLocation = useApp((s) => s.setLocation);
  const location = useApp((s) => s.location);
  const [open, setOpen] = useState(false);
  const node = open ? (
    <MapPicker
      start={location ?? (areas?.[0] ? areaToLocation(areas[0]) : { lat: 35.6921, lng: 51.4225 })}
      onCancel={() => setOpen(false)}
      onPick={(lat, lng) => {
        setLocation({ kind: "map", name: nameFor(lat, lng, areas, "نقطه‌ی انتخابی"), lat, lng });
        setOpen(false);
        onPicked?.();
      }}
    />
  ) : null;
  return { openMap: () => setOpen(true), mapNode: node };
}

/** Screen 3: change location from the chip. */
export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: areas = [] } = useAreas();
  const location = useApp((s) => s.location);
  const setLocation = useApp((s) => s.setLocation);
  const push = useToasts((s) => s.push);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const gps = useGps();
  const { openMap, mapNode } = useMapPick();
  const selected = picked ?? location?.name ?? null;
  const filtered = useMemo(() => {
    const n = normalizeFa(q);
    return n ? areas.filter((a) => normalizeFa(a.name).includes(n)) : areas;
  }, [areas, q]);
  const choice = areas.find((a) => a.name === selected);

  const useGpsNow = async () => {
    const r = await gps.run();
    if (r === "ok") onClose();
    else push({ text: r === "denied" ? "دسترسی به موقعیت رد شد؛ یک محله انتخاب کن." : "موقعیتت پیدا نشد؛ یک محله انتخاب کن." });
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="نزدیک کجا بگردم؟"
        footer={
          <button type="button" disabled={!choice || choice.name === location?.name}
            onClick={() => { if (choice) setLocation(areaToLocation(choice)); setPicked(null); onClose(); }}
            className="h-[52px] w-full rounded-button bg-radish text-[15.5px] font-bold text-white disabled:bg-line disabled:text-stem">
            {choice ? `فروشگاه‌های نزدیک ${choice.name}` : "یک محله انتخاب کن"}
          </button>
        }>
        <div className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
          <button type="button" onClick={useGpsNow} disabled={gps.busy}
            className="flex min-h-[60px] items-center gap-3 bg-card px-3.5 py-2 text-start">
            <span className="flex size-[38px] flex-none items-center justify-center rounded-full bg-radish-tint">
              <Target size={20} color="var(--color-radish)" dot="var(--color-radish)" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-body font-semibold">{gps.busy ? "در حال پیدا کردن…" : "موقعیت فعلی من"}</span>
              <span className="text-xs leading-relaxed text-stem">فاصله‌ها از همین‌جا حساب می‌شن</span>
            </span>
            <ChevronForward color="var(--color-stem)" />
          </button>
          <button type="button" onClick={openMap} className="flex min-h-[60px] items-center gap-3 bg-card px-3.5 py-2 text-start">
            <span className="flex size-[38px] flex-none items-center justify-center rounded-full bg-flesh"><MapIcon size={19} /></span>
            <span className="flex flex-1 flex-col">
              <span className="text-body font-semibold">روی نقشه انتخاب کن</span>
              <span className="text-xs leading-relaxed text-stem">یک نقطه رو روی نقشه علامت بزن</span>
            </span>
            <ChevronForward color="var(--color-stem)" />
          </button>
        </div>
        <label className="flex h-[46px] items-center gap-2.5 rounded-button border border-line bg-flesh px-3.5">
          <Glasses width={24} color="var(--color-stem)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی محله"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-stem" />
        </label>
        <span className="-mb-1 px-1 text-caption text-stem">محله‌هایی که فروشگاه ثبت‌شده دارند</span>
        <RadioRows areas={filtered} selected={selected} current={location?.name} onSelect={(a) => setPicked(a.name)} />
        {!filtered.length && <p className="px-1 text-sm text-stem">محله‌ای با این نام در داده‌ها نیست.</p>}
      </BottomSheet>
      {mapNode}
    </>
  );
}
