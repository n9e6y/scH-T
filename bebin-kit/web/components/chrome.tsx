"use client";
// App chrome (DESIGN_SYSTEM §6): bottom nav, top bar with the location chip, bottom sheet, toast.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useApp } from "@/lib/store";
import { Lockup } from "./brand";
import { ChevronDown, ChevronUp, Close, NavAssistant, NavFollowups, NavHome, NavPlan, Pin } from "./icons";

const TABS = [
  { href: "/", label: "خانه", Icon: NavHome },
  { href: "/assistant", label: "دستیار", Icon: NavAssistant },
  { href: "/inquiries", label: "پیگیری‌ها", Icon: NavFollowups },
  { href: "/plan", label: "برنامه من", Icon: NavPlan },
];

export function BottomNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="پیمایش اصلی" className="grid flex-none grid-cols-4 border-t border-line bg-card px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className="flex min-h-[52px] flex-col items-center gap-1 py-1">
            <span className={`relative flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-radish" : ""}`}>
              <Icon size={22} color={active ? "#FFFFFF" : "var(--color-stem)"} />
              {href === "/inquiries" && unread > 0 && (
                <span className="absolute top-0.5 end-3 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-radish px-0.5 text-[10px] font-bold text-white">
                  {new Intl.NumberFormat("fa-IR").format(unread)}
                </span>
              )}
            </span>
            <span className={`text-xs ${active ? "font-bold text-radish" : "text-stem"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function LocationChip({ onClick, open = false }: { onClick: () => void; open?: boolean }) {
  const location = useApp((s) => s.location);
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-expanded={open}
      className={`flex h-[38px] items-center gap-1.5 rounded-full border-[1.5px] bg-card ps-2.5 pe-3 text-[13.5px] ${open ? "border-radish" : "border-line"}`}>
      <Pin size={15} color="var(--color-radish)" />
      {location ? (
        <><span className="text-stem">نزدیک:</span><b className="font-bold">{location.name}</b></>
      ) : (
        <span className="font-semibold">موقعیت رو انتخاب کن</span>
      )}
      {open ? <ChevronUp size={14} color="var(--color-stem)" /> : <ChevronDown size={14} color="var(--color-stem)" />}
    </button>
  );
}

export function TopBar({ onLocation, locationOpen }: { onLocation: () => void; locationOpen?: boolean }) {
  return (
    <header className="flex h-14 flex-none items-center justify-between ps-4 pe-5">
      <Link href="/" aria-label="ببین، خانه"><Lockup size={32} /></Link>
      <LocationChip onClick={onLocation} open={locationOpen} />
    </header>
  );
}

/** Sheet with a drag handle; closes on backdrop tap and Escape. Radius 24 on top corners, the one shadow. */
export function BottomSheet({ open, onClose, title, children, footer }:
  { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[480px]">
      <div className="absolute inset-0 bg-soil/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal aria-label={title} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] animate-sheet flex-col rounded-t-sheet bg-card shadow-float outline-none">
        <div className="flex flex-none flex-col gap-3.5 px-4 pt-2.5">
          <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="بستن"
              className="flex size-11 items-center justify-center rounded-full bg-flesh">
              <Close size={16} color="var(--color-stem)" />
            </button>
          </div>
        </div>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-3.5 pb-3 [&>*]:shrink-0">{children}</div>
        {footer && <div className="flex-none px-4 pt-1 pb-[max(20px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type ToastItem = { id: number; text: string; action?: { label: string; onClick: () => void } };
export const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: number) => void }>(
  (set) => ({
    items: [],
    push: (t) => {
      const id = Date.now();
      set((s) => ({ items: [...s.items, { ...t, id }] }));
      setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), 5000);
    },
    dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  }),
);

/** Soil surface, action in radish-night (DESIGN_SYSTEM §2). */
export function ToastHost() {
  const { items, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-[480px] flex-col gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-button bg-soil px-4 py-2 text-sm text-flesh shadow-float">
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button type="button" className="min-h-11 px-1 font-bold text-radish-night"
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
