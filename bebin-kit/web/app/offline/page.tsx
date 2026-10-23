"use client";
// System 24a: offline. Wilted mascot; what was already loaded stays usable (plan and saved items are local).
import Link from "next/link";
import { Mascot } from "@/components/brand";

export default function OfflinePage() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Mascot pose="wilted" scale={5} />
        <h1 className="font-display text-[30px] leading-[1.35]">اینترنت قطع است</h1>
        <p className="text-sm leading-[1.9] text-stem">آنچه قبلاً دیدی هنوز روی گوشی است: برنامه، ذخیره‌شده‌ها و گفتگو. وصل که شدی، بقیه را به‌روز می‌کنم.</p>
      </div>
      <div className="flex flex-none flex-col gap-2 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => location.reload()} className="flex h-[54px] items-center justify-center rounded-button bg-radish text-base font-bold text-white">دوباره امتحان کن</button>
        <Link href="/plan" className="flex h-12 items-center justify-center rounded-button border-[1.5px] border-radish text-sm font-bold text-radish">برنامه‌ی ذخیره‌شده</Link>
      </div>
    </div>
  );
}
