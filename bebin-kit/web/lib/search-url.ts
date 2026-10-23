// Search state lives in the URL (PRODUCT_SPEC F3). The API merges URL params with what it understood from
// the query text and echoes the result as `applied`; this module turns an edited copy of `applied` back
// into URL params. A parsed filter the user turned off is sent back as `ign` so the API stops applying it.
import type { Applied, Chip } from "./api";

export type Filters = {
  cat: string | null;
  min: number | null;
  max: number | null;
  pay: string[];
  fast: boolean;
  open: boolean;
  radius: number | null; // km; null = any distance
  brand: string[];
  unk: boolean;
  sort: string;
  boost: string[]; // need-finder «use» answer (ranking only)
};

export const SORTS = [
  ["relevance", "مرتبط‌ترین"], ["cheapest", "ارزان‌ترین"], ["nearest", "نزدیک‌ترین فروشنده"], ["most_sellers", "بیشترین فروشنده"],
] as const;

export const fromApplied = (a: Applied): Filters => ({
  cat: a.cat ?? null, min: a.min ?? null, max: a.max ?? null, pay: [...(a.pay ?? [])], fast: !!a.fast,
  open: !!a.open, radius: a.radius ?? null, brand: [...(a.brand ?? [])], unk: !!a.unknown, sort: a.sort ?? "relevance",
  boost: [...(a.boost ?? [])],
});

export const CLEARED: Omit<Filters, "cat" | "sort" | "boost"> = {
  min: null, max: null, pay: [], fast: false, open: false, radius: null, brand: [], unk: false,
};

function satisfied(chip: Chip, f: Filters): boolean {
  switch (chip.key) {
    case "max": return f.max != null;
    case "min": return f.min != null;
    case "pay": return f.pay.includes(String(chip.value));
    case "open": return f.open;
    case "brand": return f.brand.length > 0;
    default: return true; // area / near: removed only through their own chip
  }
}

/** URL for a search with filters `f`. `chips` are the understood chips currently in effect, `ign` the ones
 *  already removed. `areaActive`: the query names an area or «نزدیک من», so «any distance» must be explicit. */
export function searchHref(q: string, f: Filters, ctx: { chips: Chip[]; ign: string[]; areaActive: boolean },
  extraIgn: string[] = []): string {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  if (f.cat) u.set("cat", f.cat);
  if (f.min != null) u.set("min", String(f.min));
  if (f.max != null) u.set("max", String(f.max));
  f.pay.forEach((p) => u.append("pay", p));
  if (f.fast) u.set("fast", "1");
  if (f.open) u.set("open", "1");
  if (f.radius != null) u.set("radius", String(f.radius));
  else if (ctx.areaActive) u.set("radius", "0");
  f.brand.forEach((b) => u.append("brand", b));
  if (f.unk) u.set("unk", "1");
  if (f.sort && f.sort !== "relevance") u.set("sort", f.sort);
  f.boost.forEach((b) => u.append("boost", b));
  const ign = new Set([...ctx.ign, ...extraIgn, ...ctx.chips.filter((c) => !satisfied(c, f)).map((c) => c.id)]);
  ign.forEach((i) => u.append("ign", i));
  return `/search?${u.toString()}`;
}

/** API params from the current URL (+ location). */
export function apiParams(sp: URLSearchParams, loc: { lat: number; lng: number } | null) {
  return {
    q: sp.get("q") ?? "", cat: sp.get("cat"), min: sp.get("min"), max: sp.get("max"), pay: sp.getAll("pay"),
    fast: sp.get("fast") === "1", open: sp.get("open") === "1", radius: sp.get("radius"), brand: sp.getAll("brand"),
    unk: sp.get("unk") === "1", sort: sp.get("sort"), ign: sp.getAll("ign"), boost: sp.getAll("boost"), lat: loc?.lat, lng: loc?.lng,
  };
}

/** Same, from a Filters draft (live count in the filter sheet). */
export function draftParams(q: string, f: Filters, ctx: { chips: Chip[]; ign: string[]; areaActive: boolean },
  loc: { lat: number; lng: number } | null) {
  return apiParams(new URLSearchParams(searchHref(q, f, ctx).split("?")[1]), loc);
}
