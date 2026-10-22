// Persisted client state (ARCHITECTURE §13): session id, location, onboarding, recents.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserLocation = {
  kind: "gps" | "area" | "map";
  name: string; // shown in the chip: «نزدیک: فردوسی»
  lat: number;
  lng: number;
};

export type LastViewed = { id: string; title: string; min: number | null; max: number | null; sellers: number; image: string | null };

type AppState = {
  sessionId: string;
  location: UserLocation | null;
  onboarded: boolean;
  lastViewed: LastViewed | null;
  demoClock: string | null;
  setLocation: (l: UserLocation | null) => void;
  finishOnboarding: () => void;
  setLastViewed: (p: LastViewed) => void;
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      sessionId: newId(),
      location: null,
      onboarded: false,
      lastViewed: null,
      demoClock: null,
      setLocation: (location) => set({ location }),
      finishOnboarding: () => set({ onboarded: true }),
      setLastViewed: (lastViewed) => set({ lastViewed }),
    }),
    { name: "bebin" },
  ),
);

export const getSessionId = () => useApp.getState().sessionId;
