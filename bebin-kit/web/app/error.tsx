"use client";
// System 24b: generic error. Plain words, no blame, one retry; the code is small, for support.
import Link from "next/link";
import { Mascot } from "@/components/brand";
import { faDigits, timeFa } from "@/lib/format";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Mascot pose="wilted" scale={5} />
        <h1 className="font-display text-[30px] leading-[1.35]">یه چیزی درست کار نکرد</h1>
        <p className="text-sm leading-[1.9] text-stem">تقصیر تو نیست؛ چند ثانیه‌ی دیگر دوباره امتحان کن.</p>
        <span className="text-[11px] text-stem" dir="ltr">{faDigits(`${error.digest ?? "client"} · ${timeFa(new Date())}`)}</span>
      </div>
      <div className="flex flex-none flex-col gap-2 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={reset} className="flex h-[54px] items-center justify-center rounded-button bg-radish text-base font-bold text-white">دوباره امتحان کن</button>
        <Link href="/" className="flex h-12 items-center justify-center rounded-button border-[1.5px] border-radish text-sm font-bold text-radish">برگشت به خانه</Link>
      </div>
    </div>
  );
}
