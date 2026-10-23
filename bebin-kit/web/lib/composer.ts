// Opens the ask-the-store composer sheet (Inquiry 15a–c) from any screen. The sheet is mounted once in Providers.
import { create } from "zustand";
import type { OpenStatus } from "./api";

export type ComposerShop = { id: string; name: string; open?: OpenStatus | null };
export type ComposerTarget = {
  productId: string | null; productTitle: string | null; shops: ComposerShop[];
  /** Pre-checked questions, e.g. ["installments"] from the empty-search state. */
  preset?: string[];
};

export const useComposer = create<{ target: ComposerTarget | null; open: (t: ComposerTarget) => void; close: () => void }>(
  (set) => ({ target: null, open: (target) => set({ target }), close: () => set({ target: null }) }),
);
