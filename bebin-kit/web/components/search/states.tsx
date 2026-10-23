"use client";
// Search states (Search 4b notice, 6 empty, 7 loading).
import Link from "next/link";
import type { RelaxOption, SearchOut } from "@/lib/api";
import { faNum } from "@/lib/format";
import { Glasses, Mascot } from "../brand";
import { NavAssistant } from "../icons";

const THING: Record<string, string> = {
  installments: "اقساط", torob_pay: "ترب‌پی", kala_barg: "کالابرگ", fast_delivery: "ارسال فوری", open: "ساعت کاری",
};
const TAG: Record<string, string> = { installments: "اقساطی؟", torob_pay: "ترب‌پی؟", kala_barg: "کالابرگ؟" };

const UnknownDot = () => (
  <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-ash text-[11px] font-bold text-stem">؟</span>
);

/** Dashed ash notice: sellers dropped (or included) only because their status is unknown. */
export function UnknownNotice({ counts, shown, onToggle }: { counts: Record<string, number>; shown: boolean; onToggle: () => void }) {
  const keys = Object.keys(counts).filter((k) => counts[k] > 0 && THING[k]);
  if (!keys.length) return null;
  const n = Math.max(...keys.map((k) => counts[k]));
  const things = keys.map((k) => THING[k]).join(" و ");
  const tag = keys.length === 1 && TAG[keys[0]] ? `«${TAG[keys[0]]}»` : "«؟»";
  return (
    <div className="mx-4 flex items-start gap-2 rounded-button border-[1.5px] border-dashed border-ash px-3 py-2.5">
      <UnknownDot />
      <p className="flex-1 text-[12.5px] leading-[1.8]">
        {shown
          ? `${faNum(n)} فروشنده با ${things} نامشخص هم در نتیجه‌ها آمده‌اند و برچسب ${tag} دارند. `
          : `${faNum(n)} فروشنده با وضعیت ${things} نامشخص حذف شدند. `}
        <button type="button" onClick={onToggle} className="hit font-bold whitespace-nowrap text-radish">
          {shown ? "پنهان کن" : "نمایش بده؟"}
        </button>
      </p>
    </div>
  );
}

export function LoadingGrid({ where }: { where: string | null }) {
  return (
    <div className="flex flex-col" aria-busy aria-live="polite">
      <div className="flex items-center gap-2.5 px-5 pt-[18px] pb-3.5">
        <Glasses width={34} blink />
        <span className="text-[13.5px]">{where ? `دارم فروشگاه‌های نزدیک ${where} را می‌گردم…` : "دارم فروشگاه‌ها را می‌گردم…"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        {[[60, 85, 70, 50, 45], [50, 75, 55, 60, 40], [55, 80, 65], [45, 70, 60]].map((w, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-card bg-card">
            <div className="h-[132px] bg-mist" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-2.5 rounded-full bg-line" style={{ width: `${w[0]}%` }} />
              <div className="h-3 rounded-full bg-line" style={{ width: `${w[1]}%` }} />
              <div className="mt-1.5 h-3.5 rounded-full bg-line" style={{ width: `${w[2]}%` }} />
              {w[3] && <div className="h-2.5 rounded-full bg-mist" style={{ width: `${w[3]}%` }} />}
              {w[4] && <div className="h-[22px] rounded-full bg-mist" style={{ width: `${w[4]}%` }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Search 6: what each filter costs, and the one-tap relax. */
export function EmptyResults({ data, activeLabels, onRelax }:
  { data: SearchOut; activeLabels: string[]; onRelax: (o: RelaxOption) => void }) {
  const options = (data.relax_options ?? []).slice(0, 4);
  const best = options.find((o) => o.count > 0);
  if (!options.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-7 text-center">
        <Mascot pose="confused" scale={4} />
        <h2 className="font-display text-[30px] leading-[1.35]">چیزی پیدا نکردم</h2>
        <p className="text-sm leading-[1.85] text-stem">
          {data.text ? `«${data.text}» در فهرست فروشگاه‌ها نبود. ` : ""}کلمه‌ی دیگری امتحان کن یا از دستیار بپرس.
        </p>
        <Link href={`/assistant?q=${encodeURIComponent(data.query)}`}
          className="mt-2 flex h-[46px] items-center gap-2 rounded-button border-[1.5px] border-radish px-5 text-sm font-bold text-radish">
          <NavAssistant size={17} />از دستیار بپرس
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      {!!activeLabels.length && (
        <div className="flex flex-wrap gap-1.5 px-4">
          {activeLabels.map((l) => (
            <span key={l} className="flex h-8 items-center rounded-full border-[1.5px] border-radish bg-radish-tint px-3 text-[13px] font-semibold">{l}</span>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-7 py-4 text-center">
        <Mascot pose="confused" scale={4} />
        <h2 className="font-display text-[30px] leading-[1.35]">با این فیلترها چیزی نیست</h2>
        {data.relax_note && <p className="text-sm leading-[1.85] text-stem [text-wrap:pretty]">{data.relax_note}</p>}
      </div>
      <div className="flex flex-none flex-col gap-3 px-4 pb-[18px]">
        <div className="overflow-hidden rounded-button border border-line bg-card">
          <div className="border-b border-line px-3.5 py-2 text-[11.5px] text-stem">اگر فقط یکی را برداری</div>
          {options.map((o, i) => (
            <button key={`${o.key}-${o.value}`} type="button" onClick={() => onRelax(o)} disabled={!o.count}
              className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] ${i < options.length - 1 ? "border-b border-line" : ""} ${o === best ? "bg-radish-tint" : ""}`}>
              <span className={o === best ? "font-bold" : "text-stem"}>{o.label}</span>
              <span className="mb-1.5 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
              <span className={o === best ? "font-extrabold" : o.count ? "" : "text-stem"}>{faNum(o.count)} کالا</span>
            </button>
          ))}
        </div>
        {best && (
          <button type="button" onClick={() => onRelax(best)}
            className="flex h-[54px] items-center justify-center rounded-button bg-radish text-base font-bold text-white">
            {best.action}
          </button>
        )}
      </div>
    </div>
  );
}
