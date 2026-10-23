"use client";
// Sellers map (Bebin Product.dc.html #10): grey-green tiles, pins whose glyph AND colour encode open status,
// malls clustered into a soil square with a count, the user as a radish dot; tapping a pin swaps the mini row.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SellerRow, SellersOut } from "@/lib/api";
import { faNum } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Target } from "./icons";
import { EtaLine, PlaceBlock, RowActions } from "./seller-row";
import { FreshnessTag, OpenStatusPill } from "./trust";

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const HOURGLASS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"><path d="M7 4h10l-5 8zM12 12l5 8H7z"/></svg>`;
const MOON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6E1534" stroke-width="2.6" stroke-linejoin="round"><path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/></svg>`;
const STYLE: Record<string, { bg: string; border: string; stem: string; glyph: string }> = {
  open: { bg: "#5E8F3E", border: "2px solid #fff", stem: "#5E8F3E", glyph: `<span style="width:10px;height:10px;border-radius:50%;background:#fff"></span>` },
  closing_soon: { bg: "#6F6C3A", border: "2px solid #fff", stem: "#6F6C3A", glyph: HOURGLASS },
  closed: { bg: "#F6E4EA", border: "2px solid #6E1534", stem: "#6E1534", glyph: MOON },
  unknown: { bg: "#fff", border: "2px dashed #8E9892", stem: "#8E9892", glyph: `<span style="font:800 15px Vazirmatn,sans-serif;color:#56615B">؟</span>` },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function pinHtml(label: string, state: string, selected: boolean) {
  const s = STYLE[state] ?? STYLE.unknown;
  const ring = selected ? "0 0 0 3px #fff,0 0 0 6px #C8385A" : "0 1px 2px rgba(27,36,32,.2)";
  return `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%) scale(${selected ? 1.15 : 1});transform-origin:50% 100%">
    <span style="width:36px;height:36px;border-radius:50%;background:${s.bg};border:${s.border};box-shadow:${ring};display:flex;align-items:center;justify-content:center;box-sizing:border-box">${s.glyph}</span>
    <span style="width:2px;height:8px;background:${s.stem}"></span>
    <span style="margin-top:2px;font:${selected ? 700 : 500} 10.5px Vazirmatn,sans-serif;background:#fff;padding:1px 7px;border-radius:999px;white-space:nowrap;color:#1B2420">${esc(label)}</span></div>`;
}

function mallHtml(label: string, n: number, selected: boolean) {
  return `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)">
    <span style="position:relative;width:40px;height:40px;border-radius:12px;background:#1B2420;display:flex;align-items:center;justify-content:center;${selected ? "box-shadow:0 0 0 3px #fff,0 0 0 6px #C8385A" : ""}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F7F8F6" stroke-width="1.7" stroke-linejoin="round"><path d="M4 21V5l8-2v18M12 21V9l8 2v10M3 21h18"/></svg>
      <span style="position:absolute;top:-8px;left:-8px;min-width:22px;height:22px;padding:0 4px;border-radius:999px;background:#fff;border:2px solid #1B2420;font:800 11px Vazirmatn,sans-serif;display:flex;align-items:center;justify-content:center;box-sizing:border-box">${faNum(n)}</span></span>
    <span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #1B2420"></span>
    <span style="margin-top:2px;font:600 10.5px Vazirmatn,sans-serif;background:#fff;padding:1px 6px;border-radius:999px;white-space:nowrap">${esc(label)}</span></div>`;
}

type Group = { key: string; rows: SellerRow[]; lat: number; lng: number; mall: string | null };

export default function SellersMap({ data, product, onList }:
  { data: SellersOut; product: { id: string; title: string }; onList: () => void }) {
  const loc = useApp((s) => s.location);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const groups = useMemo(() => {
    const out = new Map<string, Group>();
    for (const r of data.listed) {
      const mall = r.shop.location.mall;
      const key = mall ? `m${mall.id}` : r.shop.id;
      const g = out.get(key) ?? { key, rows: [], lat: r.shop.lat, lng: r.shop.lng, mall: mall?.name ?? null };
      g.rows.push(r);
      out.set(key, g);
    }
    return [...out.values()];
  }, [data]);
  const [sel, setSel] = useState<string | null>(data.listed[0]?.shop.id ?? null);
  const selRow = data.listed.find((r) => r.shop.id === sel) ?? data.listed[0];

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: "© OpenStreetMap", className: "bebin-tiles" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // Frame the nearest sellers (and the user), not every listing across the city.
    const near = [...data.listed].sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0)).slice(0, 8);
    const pts = near.map((r) => L.latLng(r.shop.lat, r.shop.lng));
    if (loc) pts.push(L.latLng(loc.lat, loc.lng));
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    else m.setView([35.6921, 51.4225], 14);
    return () => { m.remove(); map.current = null; };
  }, [data, loc]);

  useEffect(() => {
    const lg = layer.current;
    if (!lg) return;
    lg.clearLayers();
    if (loc) {
      L.marker([loc.lat, loc.lng], { interactive: false, icon: L.divIcon({ className: "", iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px"><span style="width:22px;height:22px;border-radius:50%;background:#C8385A;border:4px solid #fff;box-sizing:border-box;box-shadow:0 0 0 8px rgba(200,56,90,.16)"></span><span style="font:700 11px Vazirmatn,sans-serif;color:#C8385A;background:#fff;padding:1px 8px;border-radius:999px;white-space:nowrap">${esc(`شما، ${loc.name}`)}</span></div>` }) }).addTo(lg);
    }
    for (const g of groups) {
      const selected = g.rows.some((r) => r.shop.id === sel);
      const html = g.rows.length > 1 && g.mall ? mallHtml(g.mall, g.rows.length, selected)
        : pinHtml(g.rows[0].shop.name, g.rows[0].open_now.state, selected);
      L.marker([g.lat, g.lng], { zIndexOffset: selected ? 1000 : 0, keyboard: true, title: g.mall ?? g.rows[0].shop.name,
        icon: L.divIcon({ className: "", iconSize: [0, 0], html }) })
        .on("click", () => setSel(g.rows.length > 1 && selected ? g.rows[(g.rows.findIndex((r) => r.shop.id === sel) + 1) % g.rows.length].shop.id : g.rows[0].shop.id))
        .addTo(lg);
    }
  }, [groups, sel, loc]);

  const legend = [["open", "باز"], ["closing_soon", "زود می‌بندد"], ["closed", "بسته"], ["unknown", "ساعت نامشخص"]] as const;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#E8ECE7]">
      <div ref={el} className="absolute inset-0 z-0" />
      <div className="relative z-[500] flex flex-col gap-2.5 rounded-b-[20px] bg-card px-4 pt-1 pb-2.5 shadow-float">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-stem">{faNum(data.listed.length)} فروشنده{loc ? ` نزدیک ${loc.name}` : ""}</span>
          <div role="radiogroup" aria-label="نمایش" className="flex h-[38px] gap-[3px] rounded-[10px] bg-mist p-[3px]">
            <button type="button" role="radio" aria-checked={false} onClick={onList} className="flex items-center rounded-lg px-2.5 text-[13px] text-stem">فهرست</button>
            <span role="radio" aria-checked className="flex items-center rounded-lg bg-card px-2.5 text-[13px] font-bold text-radish shadow-hair">نقشه</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 px-1 text-[11px] text-stem">
          {legend.map(([k, l]) => {
            const s = STYLE[k];
            return (
              <span key={k} className="flex items-center gap-1">
                <span className="size-3 rounded-full" style={{ background: s.bg, border: k === "closed" ? "1.5px solid #6E1534" : k === "unknown" ? "1.5px dashed #8E9892" : undefined }} />{l}
              </span>
            );
          })}
        </div>
      </div>
      <div className="relative z-[500] mt-auto">
      <button type="button" aria-label="برگرد به موقعیت من" disabled={!loc}
          onClick={() => loc && map.current?.setView([loc.lat, loc.lng], 15)}
          className="absolute -top-14 end-4 z-[500] flex size-11 items-center justify-center rounded-button bg-card shadow-float disabled:opacity-50">
          <Target size={20} color="var(--color-radish)" dot="var(--color-radish)" />
        </button>
      {selRow && (
        <div className="flex flex-col gap-2.5 rounded-t-sheet bg-card px-4 pt-2.5 pb-3.5 shadow-float" aria-live="polite">
          <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
          <div className="flex items-start gap-2">
            <PlaceBlock row={selRow} />
            <span className="mt-4 min-w-3 flex-1 border-b-[1.5px] border-dotted border-leader" />
            <div className="flex flex-col items-end gap-1">
              {selRow.price.value ? (
                <span className={`tabular text-base whitespace-nowrap ${selRow.price.freshness === "stale" ? "font-semibold text-faded" : "font-extrabold"}`}>
                  {faNum(selRow.price.value)} <span className="text-[11px] font-medium">تومان</span>
                </span>
              ) : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
              {selRow.price.value && <FreshnessTag price={selRow.price} compact />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5"><EtaLine row={selRow} /><OpenStatusPill status={selRow.open_now} size="sm" /></div>
          <RowActions row={selRow} product={product} />
        </div>
      )}
      </div>
      <style>{`.bebin-tiles{filter:grayscale(1) sepia(.15) hue-rotate(60deg) saturate(.6) brightness(1.06) contrast(.92)}.leaflet-div-icon{background:none;border:0}`}</style>
    </div>
  );
}
