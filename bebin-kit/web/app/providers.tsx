"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Lockup, Mascot, MiniStamp, TorobWordmark } from "@/components/brand";
import { ToastHost, useToasts } from "@/components/chrome";
import { ComposerHost } from "@/components/composer";
import { InstallSheet, NetBanner, useInstall, useServiceWorker } from "@/components/system";
import { Hourglass } from "@/components/icons";
import type { InquiryOut } from "@/lib/api";
import { timeFa } from "@/lib/format";
import { useLiveEvents } from "@/lib/live";
import { useApp } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const hydrated = useHydrated();
  return (
    <QueryClientProvider client={client}>
      {hydrated ? <>{children}<Live /><ComposerHost /><NetBanner /><InstallSheet /></> : <Splash />}
      <ToastHost />
    </QueryClientProvider>
  );
}

/** Reply toast (Inquiry 19): the stamp sits on a white disc so stamp green never lands on soil. */
function Live() {
  const push = useToasts((s) => s.push);
  const router = useRouter();
  useServiceWorker();
  const onReply = useCallback((inq: InquiryOut, type: string) => {
    const answered = type === "answered";
    if (answered) setTimeout(() => useInstall.getState().set({ want: true }), 3000);
    const out = inq.outcome === "out_of_stock";
    push({
      text: answered ? `${inq.shop.name} ${out ? "گفت ناموجود است" : "جواب داد"}` : `${inq.shop.name} جواب نداد`,
      sub: answered ? `${inq.preview}${inq.answered_at ? `، ${timeFa(inq.answered_at)}` : ""}` : inq.preview,
      icon: (
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-card">
          {answered && !out ? <MiniStamp size={28} /> : <Hourglass size={18} color="var(--color-wilt)" />}
        </span>
      ),
      action: { label: "ببین", onClick: () => router.push(`/inquiries/${inq.id}`) },
    });
  }, [push, router]);
  useLiveEvents(onReply);
  return null;
}

/** Persisted state (location, onboarding) lives in localStorage; show the splash until it's loaded. */
function useHydrated() {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
    () => false,
  );
}

/** Screen 0: soil, default pose at 8×, lockup, endorsement. Nothing else. */
export function Splash() {
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col items-center bg-soil">
      <div className="flex flex-1 flex-col items-center justify-center gap-7 pb-16">
        <Mascot pose="default" scale={8} />
        <Lockup size={60} color="var(--color-flesh)" glasses="var(--color-radish-night)" />
      </div>
      <div className="flex items-center gap-2 pb-[max(52px,env(safe-area-inset-bottom))]">
        <span className="text-[13px] text-ash-line">از</span>
        <TorobWordmark />
      </div>
    </div>
  );
}
