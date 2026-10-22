"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { Lockup, Mascot, TorobWordmark } from "@/components/brand";
import { ToastHost } from "@/components/chrome";
import { useApp } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const hydrated = useHydrated();
  return (
    <QueryClientProvider client={client}>
      {hydrated ? children : <Splash />}
      <ToastHost />
    </QueryClientProvider>
  );
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
