"use client";
// System states (Bebin Seller and System.dc.html 24a–d): offline/online banner, install sheet, SW registration.
import Link from "next/link";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useInquiries } from "@/lib/live";
import { faNum, timeFa } from "@/lib/format";
import { BottomSheet } from "./chrome";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export const useInstall = create<{ event: BIP | null; want: boolean; set: (p: Partial<{ event: BIP | null; want: boolean }>) => void }>(
  (set) => ({ event: null, want: false, set: (p) => set(p) }),
);
const DISMISSED = "bebin-install-dismissed";

/** Soil strip under the status bar while offline; a short «دوباره وصل شدی» when it comes back. */
export function NetBanner() {
  const [offline, setOffline] = useState(false);
  const [back, setBack] = useState(false);
  const [since, setSince] = useState<Date | null>(null);
  const unread = useInquiries().data?.unread ?? 0;
  useEffect(() => {
    const off = () => { setOffline(true); setSince(new Date()); };
    const on = () => { setOffline(false); setBack(true); setTimeout(() => setBack(false), 4000); };
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, []);
  if (!offline && !back) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 mx-auto max-w-[480px] px-3 pt-[max(8px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2.5 rounded-button bg-soil px-3.5 py-2.5 text-flesh shadow-float">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {offline ? <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3-2" /></>
            : <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01" />}
        </svg>
        <span className="flex-1 text-[13px]">
          {offline ? `آفلاین هستی${since ? `، آخرین به‌روزرسانی ${timeFa(since)}` : ""}` : unread ? `دوباره وصل شدی، ${faNum(unread)} پاسخ تازه` : "دوباره وصل شدی"}
        </span>
        {offline
          ? <button type="button" onClick={() => location.reload()} className="hit text-[13px] font-bold text-radish-night">دوباره</button>
          : unread ? <Link href="/inquiries" className="text-[13px] font-bold text-radish-night">ببین</Link> : null}
      </div>
    </div>
  );
}

/** Registers the service worker (production only: it would fight dev HMR) and captures the install prompt. */
export function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => { e.preventDefault(); useInstall.getState().set({ event: e as BIP }); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
}

/** 24c: offered once, after the first seller reply (the moment the app proves useful). */
export function InstallSheet() {
  const { event, want, set } = useInstall();
  const [ios] = useState(() => typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent));
  const standalone = typeof window !== "undefined" && matchMedia("(display-mode: standalone)").matches;
  const dismissed = typeof localStorage !== "undefined" && localStorage.getItem(DISMISSED);
  const open = want && !standalone && !dismissed && (!!event || ios);
  const close = () => { try { localStorage.setItem(DISMISSED, "1"); } catch {} set({ want: false }); };
  return (
    <BottomSheet open={open} onClose={close} title="ببین را روی گوشی نصب کن"
      footer={event ? (
        <button type="button" onClick={async () => { await event.prompt(); close(); }}
          className="flex h-[54px] w-full items-center justify-center rounded-button bg-radish text-base font-bold text-white">نصب کن</button>
      ) : (
        <button type="button" onClick={close} className="flex h-[54px] w-full items-center justify-center rounded-button border-[1.5px] border-line text-base font-semibold">باشه</button>
      )}>
      <div className="flex items-center gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/app-icon-192.png" width={64} height={64} alt="" className="pixelated rounded-[16px]" />
        <p className="text-[13.5px] leading-[1.85]">جواب فروشنده‌ها را بدون باز کردن مرورگر ببین؛ برنامه‌ی بازدید و ذخیره‌شده‌ها هم روی گوشی می‌ماند.</p>
      </div>
      {!event && ios && (
        <p className="rounded-button bg-flesh px-3 py-2.5 text-[13px] leading-[1.8]">در سافاری دکمه‌ی «اشتراک‌گذاری» را بزن، بعد «Add to Home Screen».</p>
      )}
    </BottomSheet>
  );
}
