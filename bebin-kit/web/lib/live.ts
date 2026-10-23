"use client";
// Live inquiry updates over SSE (ARCHITECTURE §10): one EventSource per session, mounted in Providers.
// Events patch the TanStack caches in place, refresh the verified seller data, and raise the reply toast.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { api, API_BASE, type InquiriesOut, type InquiryOut } from "./api";
import { getSessionId } from "./store";

export const useInquiries = () =>
  useQuery({ queryKey: ["inquiries"], queryFn: () => api<InquiriesOut>("/inquiries"), staleTime: 10_000 });

export const useUnread = () => useInquiries().data?.unread ?? 0;

/** The thread page registers itself so its own updates don't also pop a toast. */
export const useLiveState = create<{ viewing: string | null; connected: boolean; set: (p: Partial<{ viewing: string | null; connected: boolean }>) => void }>(
  (set) => ({ viewing: null, connected: true, set: (p) => set(p) }),
);

type LiveEvent = { id: number; type: string; inquiry: InquiryOut };

function patch(qc: QueryClient, inq: InquiryOut) {
  qc.setQueryData(["inquiry", inq.id], inq);
  qc.invalidateQueries({ queryKey: ["inquiries"] });
}

const POLL_MS = 8_000;

export function useLiveEvents(onReply: (inq: InquiryOut, type: string) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    // PRODUCT_SPEC §6: auto-reconnect with a polling fallback. EventSource retries a dropped connection itself
    // but gives up for good after an HTTP error (readyState CLOSED), so that case reopens with backoff; while
    // disconnected, the list and the open thread are refetched every POLL_MS.
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 2_000;
    const poll = setInterval(() => {
      if (useLiveState.getState().connected) return;
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      const viewing = useLiveState.getState().viewing;
      if (viewing) qc.invalidateQueries({ queryKey: ["inquiry", viewing] });
    }, POLL_MS);
    const handle = (e: MessageEvent) => {
      let ev: LiveEvent;
      try { ev = JSON.parse(e.data); } catch { return; }
      patch(qc, ev.inquiry);
      if (ev.type === "answered" || ev.type === "no_answer") {
        if (ev.inquiry.product) qc.invalidateQueries({ queryKey: ["sellers", ev.inquiry.product.id] });
        qc.invalidateQueries({ queryKey: ["shop", ev.inquiry.shop.id] });
        if (useLiveState.getState().viewing !== ev.inquiry.id) onReply(ev.inquiry, ev.type);
      }
    };
    const open = () => {
      const src = new EventSource(`${API_BASE}/api/events?session_id=${encodeURIComponent(getSessionId())}`);
      es = src;
      for (const t of ["created", "delivered", "seen", "answered", "no_answer", "nudged", "cancelled", "replay"]) {
        src.addEventListener(t, handle as EventListener);
      }
      src.onopen = () => {
        backoff = 2_000;
        useLiveState.getState().set({ connected: true });
      };
      src.onerror = () => {
        useLiveState.getState().set({ connected: false });
        if (src.readyState === EventSource.CLOSED) {
          retry = setTimeout(open, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        }
      };
    };
    open();
    return () => {
      clearInterval(poll);
      clearTimeout(retry);
      es?.close();
    };
  }, [qc, onReply]);
}
