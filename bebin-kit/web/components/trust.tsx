// Trust components (DESIGN_SYSTEM §5). Saturation = certainty: stamp green only for seller-verified facts,
// ink for what the listing says, wilt for old, beet for wrong, dashed ash + «؟» for unknown.
// These render the API's view-ready fields; they never compute business logic.
import type { OpenStatus, Payment, Price, Stock } from "@/lib/api";
import { faDigits, jalaliDate, timeFa, toman } from "@/lib/format";
import { Glasses, MiniStamp } from "./brand";
import { Calendar, Check, Cross, Hourglass, Info, Moon, Store } from "./icons";
import { miniRadish } from "@/lib/sprites";

const pill = "inline-flex items-center gap-[5px] rounded-full whitespace-nowrap";

export function Unknown({ children, size = "md" }: { children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <span className={`${pill} border-[1.5px] border-dashed border-ash text-stem ${size === "sm" ? "h-[26px] px-[9px] text-[11.5px]" : "h-[30px] px-3 text-[12.5px]"}`}>
      <b className="font-bold">؟</b>{children}
    </span>
  );
}

function AskLink({ onAsk }: { onAsk?: () => void }) {
  return (
    <button type="button" onClick={onAsk} className="min-h-[30px] px-1.5 text-[13px] font-bold text-radish">بپرس</button>
  );
}

// ---------------------------------------------------------------- freshness
export function FreshnessTag({ price, compact = false }: { price: Price; compact?: boolean }) {
  const date = jalaliDate(price.changed_at);
  const h = compact ? "h-6 px-2 text-[11.5px]" : "h-[26px] px-2.5 text-xs";
  if (!date || price.freshness === "unknown" || !price.freshness) return <Unknown size="sm">تاریخ تغییر نامشخص</Unknown>;
  if (price.freshness === "fresh") {
    return (
      <span className={`${pill} ${h} bg-leaf-tint font-semibold text-leaf-ink`}>
        <Calendar size={compact ? 12 : 13} />{compact ? date : `تغییر قیمت: ${date}`}
      </span>
    );
  }
  return (
    <span className={`${pill} ${h} bg-wilt-tint font-semibold text-wilt`}>
      <Hourglass size={compact ? 12 : 13} />
      {price.freshness === "stale" ? `قیمت قدیمی، ${date}` : compact ? date : `تغییر قیمت: ${date}`}
    </span>
  );
}

// ---------------------------------------------------------------- price
export function PriceBlock({ price, onAsk, label = true }: { price: Price; onAsk?: () => void; label?: boolean }) {
  if (price.kind === "none" || !price.value) {
    return (
      <div className="flex items-center gap-2 rounded-button border-[1.5px] border-dashed border-ash px-3 py-2.5">
        <span className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-dashed border-ash text-[11px] font-bold text-stem">؟</span>
        <span className="flex-1 text-sm text-stem">قیمت ثبت نشده</span>
        <AskLink onAsk={onAsk} />
      </div>
    );
  }
  if (price.kind === "verified") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <MiniStamp size={40} />
          <div className="flex flex-col">
            <span className="tabular text-[22px] font-extrabold leading-[1.4] text-stamp">
              {toman(price.value, false)} <span className="text-[13px] font-semibold">تومان</span>
            </span>
            {price.verified_at && (
              <span className="text-xs font-semibold text-stamp">تأیید فروشنده، ساعت {timeFa(price.verified_at)}</span>
            )}
          </div>
        </div>
        {price.listed_value ? (
          <div className="flex flex-wrap items-center gap-2 border-t-[1.5px] border-dotted border-line pt-2">
            <span className="text-xs text-stem">ثبت‌شده: {toman(price.listed_value)}</span>
            <FreshnessTag price={{ ...price, kind: "listed" }} compact />
          </div>
        ) : null}
      </div>
    );
  }
  const stale = price.freshness === "stale";
  return (
    <div className="flex flex-col items-start gap-1.5">
      {label && <span className="text-xs text-stem">قیمت ثبت‌شده در فروشگاه</span>}
      <span className={`tabular text-[22px] leading-[1.4] ${stale ? "font-semibold text-stale-ink" : "font-extrabold"}`}>
        {toman(price.value, false)} <span className="text-[13px] font-medium">تومان</span>
      </span>
      <FreshnessTag price={price} />
    </div>
  );
}

// ---------------------------------------------------------------- stock
export function StockTag({ stock, detail, onAsk }: { stock: Stock; detail?: string; onAsk?: () => void }) {
  if (stock.state === "in_stock") {
    return (
      <span className={`${pill} h-8 border-[1.5px] border-stamp bg-stamp-tint ps-1 pe-3 text-[12.5px] font-bold text-stamp`}>
        <MiniStamp size={24} />
        {detail ? `${detail} موجود` : "موجود است"}
        {stock.verified_at && <span className="font-medium">، ساعت {timeFa(stock.verified_at)}</span>}
      </span>
    );
  }
  if (stock.state === "out_of_stock") {
    return (
      <span className={`${pill} h-[30px] bg-beet-tint px-3 text-[12.5px] font-bold text-beet`}>
        <Cross size={13} />ناموجود
        {stock.verified_at && <span className="font-medium">، ساعت {timeFa(stock.verified_at)}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Unknown>موجودی نامشخص</Unknown>
      {onAsk && <AskLink onAsk={onAsk} />}
    </span>
  );
}

// ---------------------------------------------------------------- open status
export function OpenStatusPill({ status, size = "md" }: { status: OpenStatus; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-[26px] px-2.5 text-[11.5px]" : "h-[30px] px-3 text-[12.5px]";
  const label = faDigits(status.label_fa);
  switch (status.state) {
    case "open":
      return <span className={`${pill} ${h} gap-[7px] bg-leaf-tint font-semibold text-leaf-ink`}><span className="size-2 rounded-full bg-leaf-ink" />{label}</span>;
    case "closing_soon":
      return <span className={`${pill} ${h} bg-wilt-tint font-semibold text-wilt`}><Hourglass size={13} />{label}</span>;
    case "closed":
      return <span className={`${pill} ${h} bg-beet-tint font-semibold text-beet`}><Moon size={13} />{label}</span>;
    default:
      return <Unknown size={size}>{label.replace(/^؟\s*/, "")}</Unknown>;
  }
}

// ---------------------------------------------------------------- payment
const PAY: [keyof Payment, string][] = [
  ["installments", "اقساطی"], ["torob_pay", "ترب‌پی"], ["kala_barg", "کالابرگ"], ["fast_delivery", "ارسال فوری"],
];

/** Known = ink with a check (green is reserved for seller-verified). Unknown = dashed «؟». False hidden on rows. */
export function PaymentBadges({ payment, showFalse = false, showUnknown = true }:
  { payment: Payment; showFalse?: boolean; showUnknown?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {PAY.map(([k, label]) => {
        const v = payment[k] as boolean | null;
        if (v === true) {
          return (
            <span key={k} className={`${pill} h-7 border border-ash-line px-2.5 text-xs font-medium`}>
              <Check size={12} />{label}
            </span>
          );
        }
        if (v === false) {
          return showFalse ? <span key={k} className={`${pill} h-7 px-2.5 text-xs text-stem`}>{label}: ندارد</span> : null;
        }
        return showUnknown ? (
          <span key={k} className={`${pill} h-7 gap-1 border-[1.5px] border-dashed border-ash px-2.5 text-xs text-stem`}>
            {label}<b className="font-bold">؟</b>
          </span>
        ) : null;
      })}
    </span>
  );
}

// ---------------------------------------------------------------- tiers, labels, reasons
export function TierLabel({ tier, onInfo }: { tier: "listed" | "related"; onInfo?: () => void }) {
  if (tier === "listed") {
    return (
      <span className={`${pill} h-7 border border-ash-line px-2.5 text-xs font-semibold`}>
        <Store size={13} />در فهرست فروشگاه
      </span>
    );
  }
  return (
    <button type="button" onClick={onInfo}
      className={`${pill} h-7 border-[1.5px] border-dashed border-ash px-2.5 text-xs text-stem`}>
      فروشگاه مرتبط<Info size={13} />
    </button>
  );
}

export function SimulatedLabel({ onInfo }: { onInfo?: () => void }) {
  return (
    <button type="button" onClick={onInfo} className="inline-flex items-center gap-[5px] text-micro font-medium text-stem">
      <Info size={12} />پاسخ شبیه‌سازی‌شده
    </button>
  );
}

export function ReasonLine({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) return null;
  return (
    <div className="flex items-start gap-2">
      <Glasses width={20} className="mt-1.5" />
      <span className="text-caption text-stem">{faDigits(reasons.join("، "))}</span>
    </div>
  );
}

// ---------------------------------------------------------------- the stamp
/** The full «مهر». Lands with the signature motion (scale 1.4→1, rotate −14°→−6°, 220ms). */
export function VerifiedStamp({ time, caption, land = false }: { time: string; caption?: string; land?: boolean }) {
  return (
      <div className={`flex size-[188px] flex-none -rotate-[8deg] items-center justify-center rounded-full border-4 border-stamp ${land ? "animate-stamp" : ""}`}>
        <div className="flex size-[166px] flex-col items-center justify-center gap-1.5 rounded-full border-[1.5px] border-stamp text-stamp">
          <span className="text-sm font-extrabold">تأیید فروشنده</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={miniRadish} width={36} height={36} alt="" className="pixelated" />
          <span className="text-[22px] font-extrabold leading-tight">{faDigits(time)}</span>
          {caption && <span className="text-[11px] font-semibold">{caption}</span>}
        </div>
      </div>
  );
}
