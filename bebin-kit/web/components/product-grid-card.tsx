"use client";
// ProductCard, grid variant (Search 4a): image with save + compare, title, LTR model, listed range,
// sellers + nearest, freshness tag, «چرا این؟». Stock is never shown here: it is unknown at product level.
import Link from "next/link";
import { useState } from "react";
import type { ProductCard } from "@/lib/api";
import { distance, faDigits, faNum, tomanRange } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Check } from "./icons";
import { FreshnessTag } from "./trust";

export const Bookmark = ({ filled, size = 16 }: { filled: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "var(--color-radish)" : "none"}
    stroke={filled ? "var(--color-radish)" : "var(--color-stem)"} strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);

export const Plus = ({ size = 12, color = "var(--color-radish)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Product image; missing or broken → flesh placeholder with a generic product icon in ash (System 24d, no mascot). */
export function ImageBox({ src, className = "" }: { src: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`bg-card object-contain ${className}`} />
  ) : (
    <span aria-label="تصویر در دسترس نیست" role="img" className={`flex items-center justify-center bg-flesh ${className}`}>
      <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash)" strokeWidth="1.6" strokeLinejoin="round" style={{ maxWidth: 40, maxHeight: 40 }}>
        <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9" />
      </svg>
    </span>
  );
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** The catalog's `model` is normalized («s 25 fe»); show it only when the title doesn't already carry it. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/; // catalog ids like «authentic-base-10793», not model names
export const modelLine = (title: string, model: string | null | undefined) =>
  model && squash(model) && !SLUG.test(model.trim()) && !squash(title).includes(squash(model)) ? model : null;

export function GridCard({ p }: { p: ProductCard }) {
  const inCompare = useApp((s) => s.compare.some((c) => c.id === p.id));
  const saved = useApp((s) => s.saved.includes(p.id));
  const toggleCompare = useApp((s) => s.toggleCompare);
  const toggleSaved = useApp((s) => s.toggleSaved);
  const range = tomanRange(p.price_range.min, p.price_range.max);
  const stale = p.freshest === "stale";
  const near = distance(p.nearest_distance_m);
  const model = modelLine(p.title, p.model);

  return (
    <article className="relative flex flex-col overflow-hidden rounded-card bg-card">
      <Link href={`/product/${p.id}`} className="flex flex-1 flex-col">
        <ImageBox src={p.image} className="h-[132px] w-full flex-none p-2" />
        <div className="flex flex-1 flex-col gap-[3px] px-3 pt-2.5 pb-3">
          {model ? (
            <>
              <h3 className="line-clamp-2 text-[12.5px] leading-[1.6] text-stem">{p.title}</h3>
              <bdi dir="ltr" className="block truncate text-start text-[13.5px] font-bold leading-[1.4]">{model}</bdi>
            </>
          ) : (
            <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.6]">{p.title}</h3>
          )}
          {range ? (
            <span className={`tabular mt-1 text-[13.5px] leading-[1.55] ${stale ? "font-semibold text-faded" : "font-extrabold"}`}>
              {range} <span className="text-[11px] font-medium">تومان</span>
            </span>
          ) : (
            <span className="mt-1 text-[12.5px] text-stem">قیمت ثبت نشده</span>
          )}
          <span className="text-[11.5px] leading-[1.6] text-stem">
            {faNum(p.seller_count)} فروشنده{near ? `، نزدیک‌ترین ${near}` : ""}
          </span>
          {p.price_changed_at && (
            <span className="mt-0.5 self-start">
              <FreshnessTag compact={false} price={{ kind: "listed", value: p.price_range.min, freshness: p.freshest, changed_at: p.price_changed_at }} />
            </span>
          )}
          {!!p.reasons?.length && (
            <div className="mt-auto flex flex-col gap-0.5 border-t-[1.5px] border-dotted border-line pt-2">
              <span className="text-[11px] font-bold text-radish">چرا این؟</span>
              <span className="text-[11.5px] leading-[1.65] [text-wrap:pretty]">{faDigits(p.reasons.join("، "))}</span>
            </div>
          )}
        </div>
      </Link>
      <button type="button" onClick={() => toggleSaved(p.id)} aria-pressed={saved}
        aria-label={saved ? "از ذخیره‌ها بردار" : "ذخیره کن"}
        className="absolute top-1.5 end-1.5 flex size-10 items-center justify-center">
        <span className="flex size-8 items-center justify-center rounded-full bg-card shadow-hair"><Bookmark filled={saved} /></span>
      </button>
      <button type="button" aria-pressed={inCompare}
        onClick={() => toggleCompare({ id: p.id, title: p.title, model: p.model ?? null, image: p.image ?? null })}
        className={`hit absolute top-[92px] start-2 flex h-8 items-center gap-1 rounded-full border-[1.5px] px-2.5 text-xs font-bold ${
          inCompare ? "border-radish bg-radish text-white" : "border-line bg-card"}`}>
        {inCompare ? <Check size={12} color="#FFFFFF" sw={3.2} /> : <Plus />}
        {inCompare ? "در مقایسه" : "مقایسه"}
      </button>
    </article>
  );
}
