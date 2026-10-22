// Display formatting (ARCHITECTURE §13). Persian digits, Toman, Jalali dates, Tehran time.
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const TZ = "Asia/Tehran";

export const faDigits = (s: string | number): string => String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

export const faNum = (n: number): string => new Intl.NumberFormat("fa-IR", { useGrouping: true }).format(n);

/** «۳٬۸۵۰٬۰۰۰ تومان». Null/0 never becomes «۰ تومان» (CLAUDE.md rule 7). */
export const toman = (n: number | null | undefined, unit = true): string | null =>
  n && n > 0 ? `${faNum(n)}${unit ? " تومان" : ""}` : null;

export function tomanRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min) return null;
  if (!max || max === min) return faNum(min);
  return `${faNum(min)} تا ${faNum(max)}`;
}

export const jalaliDate = (iso: string | null | undefined, withYear = false): string | null => {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: TZ, day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(iso));
};

export const timeFa = (iso: string | Date): string =>
  new Intl.DateTimeFormat("fa-IR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(typeof iso === "string" ? new Date(iso) : iso);

/** 800 → «۸۰۰ متر», 1240 → «۱٫۲ کیلومتر» (same rounding as api/app/fa.py). */
export function distance(m: number | null | undefined): string | null {
  if (m == null) return null;
  const rounded = Math.round(m / 50) * 50 || 50;
  if (rounded < 1000) return `${faDigits(rounded)} متر`;
  const km = (Math.round(m / 100) / 10).toFixed(1).replace(/\.0$/, "");
  return `${faDigits(km).replace(".", "٫")} کیلومتر`;
}

export function duration(min: number | null | undefined): string | null {
  if (min == null) return null;
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${faDigits(m)} دقیقه`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${faDigits(h)} ساعت${r ? ` و ${faDigits(r)} دقیقه` : ""}`;
}

export function relTime(iso: string, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "همین الان";
  if (diff < 60) return `${faDigits(diff)} دقیقه پیش`;
  if (diff < 24 * 60) return `${faDigits(Math.floor(diff / 60))} ساعت پیش`;
  return jalaliDate(iso) ?? "";
}
