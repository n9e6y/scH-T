"use client";
// F1 first-run location setup (Bebin Screens 1a onboarding, 1b GPS denied). Everything actionable sits in the thumb zone.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Glasses, Mascot } from "@/components/brand";
import { Blocked, ChevronForward, Lock, MapIcon, Target } from "@/components/icons";
import { areaToLocation, LocationSheet, RadioRows, useGps, useMapPick } from "@/components/location";
import { useAreas } from "@/lib/queries";
import { useApp } from "@/lib/store";

const chip = "flex h-[38px] items-center rounded-full border-[1.5px] border-line bg-card px-4 text-sm";

export default function Onboarding() {
  const router = useRouter();
  const { data: areas = [] } = useAreas();
  const setLocation = useApp((s) => s.setLocation);
  const finish = useApp((s) => s.finishOnboarding);
  const done = () => { finish(); router.replace("/"); };
  const gps = useGps();
  const { openMap, mapNode } = useMapPick(done);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [help, setHelp] = useState(false);

  const askGps = async () => {
    const r = await gps.run();
    if (r === "ok") done();
    else setDenied(true);
  };
  if (denied) {
    const choice = areas.find((a) => a.name === picked);
    return (
      <main className="flex min-h-dvh flex-col">
        <div className="flex flex-none flex-col items-center gap-2.5 px-8 pt-10 text-center">
          <Mascot pose="confused" scale={4} />
          <h1 className="font-display text-[30px] leading-[1.35]">موقعیتت رو پیدا نکردم</h1>
          <p className="text-[14.5px] leading-[1.85] text-stem">دسترسی به موقعیت مکانی خاموشه. اشکالی نداره؛ محله‌ات رو از این فهرست انتخاب کن.</p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-none flex-col gap-3 px-4 pb-[max(30px,env(safe-area-inset-bottom))]">
          <RadioRows areas={areas.slice(0, 5)} selected={picked} onSelect={(a) => setPicked(a.name)} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSheet(true)}
              className="flex h-[46px] items-center justify-center gap-1.5 rounded-button border-[1.5px] border-line bg-card text-sm font-semibold">
              <Glasses width={22} color="var(--color-soil)" />محله دیگر
            </button>
            <button type="button" onClick={openMap}
              className="flex h-[46px] items-center justify-center gap-1.5 rounded-button border-[1.5px] border-line bg-card text-sm font-semibold">
              <MapIcon size={17} />روی نقشه
            </button>
          </div>
          <div className="flex min-h-10 flex-col gap-1 rounded-button bg-beet-tint px-3 py-2">
            <div className="flex items-center gap-2">
              <Blocked size={16} color="var(--color-beet)" />
              <span className="flex-1 text-caption font-semibold text-beet">دسترسی به موقعیت رد شد</span>
              <button type="button" onClick={() => setHelp((h) => !h)} className="min-h-8 text-caption font-bold text-radish">
                چطور روشنش کنم؟
              </button>
            </div>
            {help && (
              <p className="text-xs leading-relaxed text-beet">
                در تنظیمات مرورگر، بخش «مجوزهای سایت»، اجازه‌ی «موقعیت مکانی» رو برای این سایت روشن کن و دوباره امتحان کن.
              </p>
            )}
          </div>
          <button type="button" disabled={!choice}
            onClick={() => { if (choice) { setLocation(areaToLocation(choice)); done(); } }}
            className="h-[54px] rounded-button bg-radish text-base font-bold text-white disabled:bg-line disabled:text-stem">
            {choice ? `ادامه با ${choice.name}` : "یک محله انتخاب کن"}
          </button>
          <button type="button" onClick={done} className="h-10 text-sm text-stem">فعلاً رد شو</button>
        </div>
        <LocationSheet open={sheet} onClose={() => { setSheet(false); if (useApp.getState().location) done(); }} />
        {mapNode}
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center-safe gap-[18px] px-8 py-6 text-center">
        <Mascot pose="searching" scale={5} />
        <h1 className="font-display text-[36px] leading-[1.35]">همون بار اول، مغازه درست.</h1>
        <p className="text-[15px] leading-[1.9] text-stem">
          بگو کجایی تا فروشگاه‌های نزدیکت رو پیدا کنم و قبل از رفتن، قیمت و موجودی رو از خود فروشنده بپرسم.
        </p>
      </div>
      <div className="flex flex-none flex-col gap-3 px-4 pb-[max(30px,env(safe-area-inset-bottom))]">
        <span className="px-1 text-[13px] text-stem">یا یک محله انتخاب کن</span>
        <div className="flex flex-wrap gap-2">
          {areas.slice(0, 7).map((a) => (
            <button key={a.id} type="button" className={chip} onClick={() => { setLocation(areaToLocation(a)); done(); }}>
              {a.name}
            </button>
          ))}
          <button type="button" className={`${chip} gap-1 text-stem`} onClick={() => setSheet(true)}>
            بیشتر<ChevronForward size={14} color="var(--color-stem)" />
          </button>
        </div>
        <button type="button" onClick={openMap}
          className="mt-1 flex h-12 items-center justify-center gap-2 rounded-button border-[1.5px] border-radish bg-card text-[14.5px] font-bold text-radish">
          <MapIcon size={18} color="var(--color-radish)" />روی نقشه انتخاب کن
        </button>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-stem">
          <Lock size={13} />موقعیتت فقط برای حساب کردن فاصله‌ها استفاده می‌شه.
        </p>
        <button type="button" onClick={askGps} disabled={gps.busy}
          className="flex h-[54px] items-center justify-center gap-2 rounded-button bg-radish text-base font-bold text-white hover:bg-radish-hover">
          <Target size={20} color="#FFFFFF" dot="#FFFFFF" />{gps.busy ? "در حال پیدا کردن…" : "موقعیت فعلی من"}
        </button>
        <button type="button" onClick={done} className="h-10 text-sm text-stem">فعلاً رد شو</button>
      </div>
      <LocationSheet open={sheet} onClose={() => { setSheet(false); if (useApp.getState().location) done(); }} />
      {mapNode}
    </main>
  );
}
