// Persisted client state (ARCHITECTURE §13): session id, location, onboarding, recents.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserLocation = {
  kind: "gps" | "area" | "map";
  name: string; // shown in the chip: «نزدیک: فردوسی»
  lat: number;
  lng: number;
};

export type CompareItem = { id: string; title: string; model: string | null; image: string | null };
export const COMPARE_MAX = 3;

/** A stop in «برنامه من» (F12). */
export type PlanStop = {
  shopId: string; shopName: string; lat: number; lng: number; mallId: number | null;
  productId: string | null; productTitle: string | null; addedAt: string;
  swappedFrom?: { shopId: string; shopName: string } | null;
};

export type LastViewed = { id: string; title: string; min: number | null; max: number | null; sellers: number; image: string | null };

type AppState = {
  sessionId: string;
  location: UserLocation | null;
  onboarded: boolean;
  lastViewed: LastViewed | null;
  demoClock: string | null;
  compare: CompareItem[];
  saved: string[];
  plan: PlanStop[];
  togglePlan: (stop: Omit<PlanStop, "addedAt">) => boolean;
  setPlan: (plan: PlanStop[]) => void;
  planOrdered: boolean; // true after a manual drag: the API keeps the order instead of optimising
  setPlanOrdered: (v: boolean) => void;
  toggleCompare: (item: CompareItem) => void;
  removeCompare: (id: string) => void;
  toggleSaved: (id: string) => void;
  setDemoClock: (iso: string | null) => void;
  setLocation: (l: UserLocation | null) => void;
  finishOnboarding: () => void;
  setLastViewed: (p: LastViewed) => void;
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      sessionId: newId(),
      location: null,
      onboarded: false,
      lastViewed: null,
      demoClock: null,
      compare: [],
      saved: [],
      plan: [],
      /** Returns true when the stop was added. One stop per shop. */
      togglePlan: (stop) => {
        const has = get().plan.some((p) => p.shopId === stop.shopId);
        set((s) => ({
          plan: has ? s.plan.filter((p) => p.shopId !== stop.shopId) : [...s.plan, { ...stop, addedAt: new Date().toISOString() }],
        }));
        return !has;
      },
      setPlan: (plan) => set({ plan }),
      planOrdered: false,
      setPlanOrdered: (planOrdered) => set({ planOrdered }),
      // A fourth product pushes out the oldest, so the tray never blocks the tap.
      toggleCompare: (item) => set((s) => ({
        compare: s.compare.some((c) => c.id === item.id)
          ? s.compare.filter((c) => c.id !== item.id)
          : [...s.compare, item].slice(-COMPARE_MAX),
      })),
      removeCompare: (id) => set((s) => ({ compare: s.compare.filter((c) => c.id !== id) })),
      toggleSaved: (id) => set((s) => ({ saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] })),
      setDemoClock: (demoClock) => set({ demoClock }),
      setLocation: (location) => set({ location }),
      finishOnboarding: () => set({ onboarded: true }),
      setLastViewed: (lastViewed) => set({ lastViewed }),
    }),
    { name: "bebin" },
  ),
);

export const getSessionId = () => useApp.getState().sessionId;
