"use client";
// Full-screen point picker (F1 "pick on map"). Tiles are desaturated so only our two hues carry meaning.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { Close, Pin } from "./icons";

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function MapPicker({ start, onPick, onCancel }:
  { start: { lat: number; lng: number }; onPick: (lat: number, lng: number) => void; onCancel: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], 15);
    L.tileLayer(TILES, { maxZoom: 19, attribution: "© OpenStreetMap", className: "bebin-tiles" }).addTo(m);
    map.current = m;
    return () => { m.remove(); };
  }, [start.lat, start.lng]);
  return (
    <div role="dialog" aria-modal aria-label="انتخاب روی نقشه" className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-flesh">
      <div className="flex h-14 flex-none items-center justify-between px-4">
        <span className="text-heading font-bold">نقطه رو روی نقشه بذار</span>
        <button type="button" onClick={onCancel} aria-label="بستن" className="flex size-11 items-center justify-center rounded-full bg-card">
          <Close size={16} color="var(--color-stem)" />
        </button>
      </div>
      <div className="relative flex-1">
        <div ref={el} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <span className="-translate-y-3"><Pin size={40} color="var(--color-radish)" sw={2.4} /></span>
        </div>
      </div>
      <div className="flex-none p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button type="button" className="h-[52px] w-full rounded-button bg-radish text-[15.5px] font-bold text-white"
          onClick={() => { const c = map.current?.getCenter(); if (c) onPick(c.lat, c.lng); }}>
          همین‌جا رو انتخاب کن
        </button>
      </div>
      <style>{`.bebin-tiles{filter:grayscale(1) sepia(.15) hue-rotate(60deg) saturate(.6) brightness(1.06) contrast(.92)}`}</style>
    </div>
  );
}
