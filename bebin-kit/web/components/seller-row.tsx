"use client";
// SellerRow (receipt), Product 9a/10 + Handoff: name/place … dotted leader … price; ETA + open; payments + stock;
// reason; flexible 44px actions. Saturation falls with certainty: verified rows sit on stamp-row with green leaders.
import { useRouter } from "next/navigation";
import type { SellerRow as Row } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { useInquiries } from "@/lib/live";
import { distance, duration, faNum, timeFa } from "@/lib/format";
import { directionsUrl, placeLine } from "@/lib/place";
import { useApp } from "@/lib/store";
import { MiniStamp } from "./brand";
import { useToasts } from "./chrome";
import { Check } from "./icons";
import { FreshnessTag, OpenStatusPill, ReasonLine, StockTag, Unknown } from "./trust";

export function usePlanToggle() {
  const togglePlan = useApp((s) => s.togglePlan);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  return (row: Row, product: { id: string; title: string } | null) => {
    const added = togglePlan({
      shopId: row.shop.id, shopName: row.shop.name, lat: row.shop.lat, lng: row.shop.lng,
      mallId: row.shop.location.mall?.id ?? null, productId: product?.id ?? null, productTitle: product?.title ?? null,
    });
    if (added) {
      push({ text: "به برنامه اضافه شد", icon: <Check size={16} color="var(--color-radish-night)" />,
        action: { label: "ببین", onClick: () => router.push("/plan") } });
    }
  };
}

function Price({ row }: { row: Row }) {
  const p = row.price;
  if (p.kind === "verified" && p.value) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <MiniStamp size={28} />
          <span className="tabular text-base font-extrabold whitespace-nowrap text-stamp">{faNum(p.value)} <span className="text-[11px] font-semibold">تومان</span></span>
        </div>
        {p.verified_at && <span className="text-[11.5px] font-semibold text-stamp">تأیید فروشنده، {timeFa(p.verified_at)}</span>}
        {p.listed_value ? <span className="text-[11px] whitespace-nowrap text-stem">ثبت‌شده {faNum(p.listed_value)}</span> : null}
      </div>
    );
  }
  if (!p.value) return <Unknown size="sm">قیمت ثبت نشده</Unknown>;
  const stale = p.freshness === "stale";
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`tabular text-base whitespace-nowrap ${stale ? "font-semibold text-faded" : "font-extrabold"}`}>
        {faNum(p.value)} <span className="text-[11px] font-medium">تومان</span>
      </span>
      <FreshnessTag price={p} compact={false} />
    </div>
  );
}

export function PlaceBlock({ row }: { row: Row }) {
  const place = placeLine(row.shop);
  return (
    <div className="flex max-w-[52%] min-w-0 flex-none flex-col gap-[3px]">
      <span className="text-[15.5px] leading-normal font-bold">{row.shop.name}</span>
      {place && <span className="text-xs leading-[1.6] text-stem">{place}</span>}
      {row.shop.location.state === "mall_only" && (
        <span className="self-start"><Unknown size="sm">طبقه و واحد ثبت نشده</Unknown></span>
      )}
    </div>
  );
}

export function EtaLine({ row }: { row: Row }) {
  const d = distance(row.distance_m);
  const eta = duration(row.eta_min);
  if (!d) return null;
  return (
    <span className="me-1 text-xs">
      {d}{eta ? `، ${eta} ${row.travel === "car" ? "با تاکسی" : "پیاده"}، تخمینی` : ""}
    </span>
  );
}

type Btn = { label: string; kind: "primary" | "secondary" | "ghost"; onClick?: () => void; href?: string };
const BTN = {
  primary: "border-radish bg-radish text-white",
  secondary: "border-radish bg-card text-radish",
  ghost: "border-line bg-card text-soil",
};

export function RowActions({ row, product }: { row: Row; product: { id: string; title: string } | null }) {
  const inPlan = useApp((s) => s.plan.some((p) => p.shopId === row.shop.id));
  const togglePlan = usePlanToggle();
  const openComposer = useComposer((s) => s.open);
  const router = useRouter();
  const verified = row.stock.state === "in_stock";
  const closed = row.open_now.state === "closed";
  const inquiries = useInquiries().data;
  const thread = inquiries?.groups.flatMap((g) => g.items).find((i) => i.shop.id === row.shop.id && (!product || i.product?.id === product.id));
  const ask = () => openComposer({
    productId: product?.id ?? null, productTitle: product?.title ?? null,
    shops: [{ id: row.shop.id, name: row.shop.name, open: row.open_now }],
  });
  const plan: Omit<Btn, "kind"> = { label: inPlan ? "در برنامه" : "به برنامه اضافه کن", onClick: () => togglePlan(row, product) };
  const route: Omit<Btn, "kind"> = { label: "مسیر", href: directionsUrl(row.shop.lat, row.shop.lng) };
  const btns: Btn[] = verified
    ? [{ ...plan, kind: "primary" }, { ...route, kind: "secondary" }, { label: "گفتگو", kind: "ghost", onClick: () => router.push(thread ? `/inquiries/${thread.id}` : "/inquiries") }]
    : closed
      ? [{ label: "بپرس", kind: "secondary", onClick: ask }, { ...route, kind: "ghost" }, { ...plan, kind: "ghost" }]
      : [{ label: "بپرس", kind: "primary", onClick: ask }, { ...route, kind: "secondary" }, { ...plan, kind: "ghost" }];
  return (
    <div className="flex gap-1.5">
      {btns.map((b) => {
        const cls = `flex h-11 flex-auto items-center justify-center rounded-button border-[1.5px] px-2.5 text-[13px] font-bold whitespace-nowrap ${BTN[b.kind]}`;
        return b.href ? (
          <a key={b.label} href={b.href} target="_blank" rel="noopener" className={cls}>{b.label}</a>
        ) : (
          <button key={b.label} type="button" onClick={b.onClick} aria-pressed={b.label === "در برنامه" || undefined} className={cls}>{b.label}</button>
        );
      })}
    </div>
  );
}

export function SellerRowView({ row, product, compact = false }:
  { row: Row; product: { id: string; title: string } | null; compact?: boolean }) {
  const verified = row.price.kind === "verified" || row.stock.state !== "unknown";
  const pays = (["installments", "torob_pay"] as const).filter((k) => row.payment[k] !== false);
  return (
    <div className={`flex flex-col gap-2.5 px-3.5 pt-3.5 pb-3 ${verified ? "bg-stamp-row" : "bg-card"}`}>
      <div className="flex items-start gap-2">
        <PlaceBlock row={row} />
        <span className={`mt-4 min-w-3 flex-1 border-b-[1.5px] border-dotted ${verified ? "border-stamp-leader" : "border-leader"}`} />
        <Price row={row} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <EtaLine row={row} />
        <OpenStatusPill status={row.open_now} size="sm" />
      </div>
      {row.arrival_note && <span className="-mt-1 text-[11.5px] font-semibold text-wilt">{row.arrival_note}</span>}
      {!compact && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {pays.map((k) => {
              const label = k === "installments" ? "اقساطی" : "ترب‌پی";
              return row.payment[k] ? (
                <span key={k} className="inline-flex h-[26px] items-center gap-1 rounded-full border border-leader px-[9px] text-[11.5px] font-medium">
                  <Check size={11} />{label}
                </span>
              ) : (
                <span key={k} className="inline-flex h-[26px] items-center gap-[3px] rounded-full border-[1.5px] border-dashed border-ash px-[9px] text-[11.5px] text-stem">
                  {label}<b>؟</b>
                </span>
              );
            })}
            <StockTag stock={row.stock} />
          </div>
          <ReasonLine reasons={row.reasons} />
        </>
      )}
      <RowActions row={row} product={product} />
    </div>
  );
}
