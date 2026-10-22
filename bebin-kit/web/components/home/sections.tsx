"use client";
import Link from "next/link";
import type { CategoryGroup } from "@/lib/api";
import { distance, duration, faNum, tomanRange } from "@/lib/format";
import { useAreas, useCategories, useMallsNear } from "@/lib/queries";
import { useApp, type LastViewed } from "@/lib/store";
import { Glasses, Mascot } from "../brand";
import { areaToLocation } from "../location";
import { Building, CATEGORY_ICONS, ChevronForward } from "../icons";

// Shopper-facing groups first; the long tail sits behind «همه».
const ORDER = ["mobile", "audio", "laptop", "fashion", "appliances", "beauty", "watch", "lighting", "electrical", "security", "industrial", "car", "toys"];

export function CategoryRow() {
  const { data } = useCategories();
  const groups = (data ?? []).filter((g) => g.key !== "other").sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const items: (CategoryGroup | null)[] = data ? [...groups.slice(0, 7), null] : Array(8).fill(undefined);
  return (
    <nav aria-label="دسته‌ها" className="no-scrollbar flex flex-none gap-0.5 overflow-x-auto px-3">
      {items.map((g, i) => {
        const key = g?.key ?? "all";
        const Icon = CATEGORY_ICONS[key] ?? CATEGORY_ICONS.all;
        const label = g === null ? "همه" : g?.label;
        return (
          <Link key={g?.key ?? `x${i}`} href={g ? `/search?cat=${g.key}` : "/search"}
            className="flex w-[78px] flex-none flex-col items-center gap-1.5">
            <span className="flex size-[60px] items-center justify-center rounded-card border border-line bg-card">
              {label ? <Icon color="var(--color-stem)" /> : null}
            </span>
            <span className="min-h-[34px] text-center text-[11.5px] leading-normal">{label ?? ""}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Assistant entry. Avatar is the mascot unless the screen already shows one (first-time variant). */
export function AssistantEntry({ mascotAvatar }: { mascotAvatar: boolean }) {
  return (
    <Link href="/assistant" className="mx-4 flex flex-none items-center gap-3 rounded-card bg-radish-tint py-3 ps-3 pe-3.5">
      <span className="flex size-14 flex-none items-center justify-center rounded-full bg-card">
        {mascotAvatar ? <Mascot pose="searching" scale={2} /> : <Glasses width={34} />}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15.5px] font-bold">بگو چی می‌خوای، من می‌گردم</span>
        <span className="text-caption text-stem">قیمت و موجودی رو هم از فروشنده‌ها می‌پرسم.</span>
      </span>
      <ChevronForward size={20} color="var(--color-radish)" sw={2.4} />
    </Link>
  );
}

export function ContinueSection({ last }: { last: LastViewed }) {
  return (
    <section className="flex flex-none flex-col gap-2.5 px-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-bold">ادامه بده</h2>
        <Link href="/inquiries" className="text-[13px] font-semibold text-radish">همه پیگیری‌ها</Link>
      </div>
      {/* Links to /p/[id] once the product page is designed (prompt 4). */}
      <div className="flex items-center gap-3 rounded-card bg-card p-3">
        {last.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={last.image} alt="" width={60} height={60} loading="lazy" className="size-[60px] flex-none rounded-button object-cover" />
        ) : (
          <span className="size-[60px] flex-none rounded-button bg-placeholder" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-[11.5px] text-stem">آخرین کالایی که دیدی</span>
          <span className="truncate text-sm font-semibold leading-relaxed">{last.title}</span>
          <span className="text-caption">
            {tomanRange(last.min, last.max) ? <><b className="font-bold">{tomanRange(last.min, last.max)}</b> تومان</> : "قیمت ثبت نشده"}
            <span className="text-stem">، ثبت‌شده، <span className="whitespace-nowrap">{faNum(last.sellers)} فروشنده</span></span>
          </span>
        </span>
      </div>
    </section>
  );
}

/** First-time empty state: the screen's one mascot lives here. */
export function FirstTime({ onExample }: { onExample: () => void }) {
  return (
    <section className="flex flex-none flex-col items-center gap-2.5 px-8 pt-3 pb-1 text-center">
      <Mascot pose="default" scale={4} />
      <h2 className="font-display text-[26px] leading-[1.35]">هنوز چیزی نگشتی</h2>
      <p className="text-[13.5px] leading-[1.85] text-stem">یه کالا بگو؛ فروشگاه‌های نزدیکت رو با قیمت، فاصله و ساعت کاری کنار هم می‌ذارم.</p>
      <button type="button" onClick={onExample}
        className="mt-1 flex min-h-[38px] items-center gap-1.5 rounded-full border-[1.5px] border-line bg-card px-3.5 py-1.5 text-[13px]">
        <span className="text-stem">مثلاً:</span><span className="font-semibold">گوشی سامسونگ زیر ۶۰ میلیون اقساطی</span>
      </button>
    </section>
  );
}

export function AroundYou({ onSetLocation }: { onSetLocation: () => void }) {
  const location = useApp((s) => s.location);
  const setLocation = useApp((s) => s.setLocation);
  const { data: areas } = useAreas();
  const { data: malls, isLoading } = useMallsNear();
  // Coverage is ~10% of Tehran, mostly downtown. Say so when nothing is walkable from here.
  const outOfCoverage = !!location && !isLoading && (!malls?.length || (malls[0].distance_m ?? 0) > 2500);

  return (
    <section className="flex flex-none flex-col gap-2.5">
      <div className="flex flex-col gap-px px-5">
        <h2 className="text-base font-bold">اطراف تو</h2>
        <span className="text-xs text-stem">بر اساس ساعت کاری ثبت‌شده فروشگاه‌ها</span>
      </div>
      {!location ? (
        <button type="button" onClick={onSetLocation}
          className="mx-4 flex min-h-14 items-center gap-3 rounded-card border-[1.5px] border-dashed border-ash bg-card px-3.5 py-3 text-start">
          <span className="flex-1 text-sm text-stem">موقعیتت رو بگو تا پاساژها و فروشگاه‌های اطرافت رو نشون بدم.</span>
          <span className="text-[13px] font-bold text-radish">انتخاب موقعیت</span>
        </button>
      ) : null}
      {outOfCoverage && (
        <div className="mx-4 flex flex-col gap-2 rounded-card bg-wilt-tint p-3.5">
          <p className="text-[13px] leading-relaxed text-wilt">
            نزدیک تو فروشگاه زیادی در داده‌های این نسخه نیست. بیشتر فروشگاه‌ها در فردوسی، شیخ هادی و بهارستان هستند.
          </p>
          {areas?.[0] && (
            <button type="button" onClick={() => setLocation(areaToLocation(areas[0]))}
              className="min-h-11 self-start text-[13px] font-bold text-radish">نزدیک {areas[0].name} ببین</button>
          )}
        </div>
      )}
      {location && !!(isLoading || malls?.length) && (
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
          {(isLoading ? Array(2).fill(null) : malls ?? []).map((m, i) =>
            m ? (
              <div key={m.id} className="flex w-[196px] flex-none flex-col gap-1.5 rounded-card bg-card p-3.5">
                <Building size={22} color="var(--color-stem)" />
                <span className="truncate text-[14.5px] font-bold">{m.name}</span>
                <span className="text-xs text-stem">
                  {distance(m.distance_m)}{m.eta_min != null && m.eta_min < 30 ? `، ${duration(m.eta_min)} پیاده` : ""}
                </span>
                {m.open_count > 0 ? (
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-leaf-ink">
                    <span className="size-[7px] rounded-full bg-leaf-ink" />{faNum(m.open_count)} فروشگاه باز
                  </span>
                ) : (
                  <span className="text-[12.5px] text-stem">الان فروشگاه بازی ثبت نشده</span>
                )}
              </div>
            ) : (
              <div key={i} className="h-[124px] w-[196px] flex-none rounded-card bg-card" aria-hidden />
            ),
          )}
        </div>
      )}
    </section>
  );
}
