// Assistant chat state (F13): history persists locally; the server is stateless. Replies stream over SSE from
// POST /api/assistant/chat (fetch + ReadableStream, since EventSource can't POST).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE, type S } from "./api";
import { getSessionId, useApp } from "./store";

export type Block = S["AssistantSchema"]["block"] | { type: "inquiry_status"; ids: string[]; at: string };
export type ToolLine = { id: string; label: string; state: "running" | "done" };
export type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: Block[];
  tools: ToolLine[];
  summary?: string;
  pending?: boolean;
  fallback?: boolean;
  answered?: string; // for question_chips: the option the user picked
};

type ChatState = {
  messages: Msg[];
  busy: boolean;
  add: (m: Msg) => void;
  update: (id: string, f: (m: Msg) => Msg) => void;
  reset: () => void;
  setBusy: (b: boolean) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useChat = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      busy: false,
      add: (m) => set((s) => ({ messages: [...s.messages, m].slice(-40) })),
      update: (id, f) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? f(m) : m)) })),
      reset: () => set({ messages: [], busy: false }),
      setBusy: (busy) => set({ busy }),
    }),
    { name: "bebin-chat", partialize: (s) => ({ messages: s.messages.map((m) => ({ ...m, pending: false })) }) },
  ),
);

/** What the model sees of earlier turns: the text, plus which products were on screen. */
function history(messages: Msg[]) {
  return messages.filter((m) => m.text || m.summary).slice(-12).map((m) => ({
    role: m.role,
    content: (m.text || "") + (m.role === "assistant" && m.summary ? `\n[روی صفحه: ${m.summary}]` : ""),
  }));
}

export async function send(text: string) {
  const st = useChat.getState();
  if (st.busy || !text.trim()) return;
  const app = useApp.getState();
  st.add({ id: uid(), role: "user", text: text.trim(), blocks: [], tools: [] });
  const id = uid();
  st.add({ id, role: "assistant", text: "", blocks: [], tools: [], pending: true });
  st.setBusy(true);
  const upd = (f: (m: Msg) => Msg) => useChat.getState().update(id, f);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Session-Id": getSessionId() };
    if (app.demoClock) headers["X-Demo-Clock"] = app.demoClock;
    const res = await fetch(`${API_BASE}/api/assistant/chat`, {
      method: "POST", headers,
      body: JSON.stringify({
        messages: history(useChat.getState().messages.filter((m) => m.id !== id)),
        context: {
          location_name: app.location?.name, lat: app.location?.lat, lng: app.location?.lng,
          compare_ids: app.compare.map((c) => c.id), plan_shop_ids: app.plan.map((p) => p.shopId),
        },
      }),
    });
    if (!res.ok || !res.body) throw new Error(String(res.status));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
        if (!data) continue;
        const ev = JSON.parse(data);
        if (ev.type === "text_delta") upd((m) => ({ ...m, text: m.text + ev.text }));
        else if (ev.type === "tool_status") {
          upd((m) => ({ ...m, tools: [...m.tools.filter((t) => t.id !== ev.id), { id: ev.id, label: ev.label, state: ev.state }] }));
        } else if (ev.type === "block") upd((m) => ({ ...m, blocks: [...m.blocks, ev.block] }));
        else if (ev.type === "done") upd((m) => ({ ...m, pending: false, summary: ev.summary, fallback: ev.fallback }));
      }
    }
  } catch {
    upd((m) => ({ ...m, blocks: [...m.blocks, { type: "notice", level: "wilt", text: "جواب نیامد؛ اتصال را چک کن و دوباره بپرس." }] }));
  } finally {
    upd((m) => ({ ...m, pending: false }));
    useChat.getState().setBusy(false);
  }
}

/** A client-side block appended after the user confirms an inquiry inside chat. */
export function appendStatus(ids: string[]) {
  useChat.getState().add({ id: uid(), role: "user", text: "بپرس", blocks: [], tools: [] });
  useChat.getState().add({ id: uid(), role: "assistant", text: "", tools: [], blocks: [{ type: "inquiry_status", ids, at: new Date().toISOString() }] });
}

export function markAnswered(msgId: string, option: string) {
  useChat.getState().update(msgId, (m) => ({ ...m, answered: option }));
}
