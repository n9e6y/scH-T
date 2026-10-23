"use client";
// F13 Assistant (Bebin Assistant.dc.html 21a–d): header avatar (the screen's one mascot), user bubbles in
// radish-tint, assistant text on flesh, tool lines, UI blocks, suggestions and the composer docked at the bottom.
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BlockView } from "@/components/assistant-blocks";
import { Glasses } from "@/components/brand";
import { BottomNav } from "@/components/chrome";
import { Check, ChevronForward } from "@/components/icons";
import { api } from "@/lib/api";
import { send, useChat } from "@/lib/chat";
import { faDigits } from "@/lib/format";
import { mascot, mascotHead } from "@/lib/sprites";

const EXAMPLES = ["اسپیکر جی بی ال اقساطی نزدیک فردوسی", "گوشی سامسونگ زیر ۶۰ میلیون", "شارژر سامسونگ ۲۵ وات"];
const FOLLOW = ["ارزون‌ترش؟", "فقط اونایی که الان بازن", "از فروشنده‌ها بپرس", "به برنامه اضافه کن"];

function Avatar({ wilted }: { wilted: boolean }) {
  return (
    <span className={`flex size-11 flex-none items-center justify-center overflow-hidden rounded-full ${wilted ? "bg-wilt-tint" : "bg-radish-tint"}`}>
      {wilted ? (
        <span aria-hidden className="pixelated block size-8 bg-no-repeat" style={{ backgroundImage: `url(${mascot("wilted")})`, backgroundSize: "48px 48px", backgroundPosition: "-8px -8px" }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mascotHead} width={32} height={32} alt="" className="pixelated" />
      )}
    </span>
  );
}

function Chat() {
  const sp = useSearchParams();
  const router = useRouter();
  const { messages, busy, reset } = useChat();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: () => api<{ llm: boolean }>("/assistant/status"), staleTime: 60_000 });
  const wilted = status.data?.llm === false || !!messages.at(-1)?.fallback;
  const sent = useRef(false);

  useEffect(() => {
    const q = sp.get("q");
    if (q && !sent.current) { sent.current = true; send(q); router.replace("/assistant"); }
  }, [sp, router]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text;
  const submit = (t: string) => { if (!t.trim() || busy) return; send(t); setText(""); };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-none items-center gap-2.5 border-b border-line bg-card ps-5 pe-3 pt-1 pb-3">
        <Avatar wilted={wilted} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[17px] font-bold">دستیار</h1>
          <span className="text-[11.5px] text-stem">{wilted ? "فعلاً فقط جست‌وجوی ساده" : "از ترب، قیمت‌ها از فهرست فروشگاه‌ها"}</span>
        </div>
        {!!messages.length && (
          <button type="button" onClick={reset} disabled={busy} className="hit flex h-11 items-center px-2 text-[13px] font-semibold text-radish">گفتگوی تازه</button>
        )}
      </header>

      <main ref={scroller} className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-4 pb-5" aria-live="polite">
        {!messages.length && (
          <div className="flex flex-col gap-3">
            <p className="text-[14.5px] leading-[1.9]">سلام! بگو چی می‌خوای؛ فروشگاه‌های نزدیکت را می‌گردم، مقایسه می‌کنم و اگر بخواهی از فروشنده‌ها می‌پرسم.</p>
            <p className="text-xs leading-[1.7] text-stem">قیمت‌ها از فهرست فروشگاه‌هاست؛ موجودی را فقط وقتی می‌گویم که فروشنده جواب داده باشد.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const last = i === messages.length - 1;
          if (m.role === "user") {
            return <div key={m.id} className="max-w-[82%] flex-none self-end rounded-[16px_16px_16px_4px] bg-radish-tint px-3.5 py-2.5 text-sm leading-[1.8]">{m.text}</div>;
          }
          return (
            <div key={m.id} className="flex flex-none flex-col gap-3">
              {m.tools.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[12.5px] text-stem">
                  {t.state === "running" ? <Glasses width={24} blink /> : <Check size={14} color="var(--color-stem)" />}{t.label}
                </div>
              ))}
              {m.pending && !m.tools.length && !m.text && !m.blocks.length && (
                <div className="flex items-center gap-2 text-[12.5px] text-stem"><Glasses width={24} blink />دارم فکر می‌کنم…</div>
              )}
              {m.blocks.filter((b) => b.type === "notice").map((b, k) => (
                <BlockView key={`n${k}`} b={b} msgId={m.id} last={last} retry={last && lastUser ? () => send(lastUser) : undefined} />
              ))}
              {m.text && <p className="text-[14.5px] leading-[1.9] whitespace-pre-line [text-wrap:pretty]">{faDigits(m.text.replace(/\*\*/g, ""))}</p>}
              {m.blocks.filter((b) => b.type !== "notice").map((b, k) => (
                <BlockView key={k} b={b} msgId={m.id} answered={m.answered} last={last} />
              ))}
            </div>
          );
        })}
      </main>

      <div className="flex flex-none flex-col gap-2 border-t border-line bg-flesh pt-2 pb-2.5">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4">
          {(messages.length ? FOLLOW : EXAMPLES).map((g) => (
            <button key={g} type="button" disabled={busy} onClick={() => submit(g)}
              className="flex h-[34px] flex-none items-center rounded-full border-[1.5px] border-line bg-card px-3 text-[13px] whitespace-nowrap hover:border-radish disabled:opacity-60">{g}</button>
          ))}
        </div>
        <form className="flex items-center gap-2 px-4" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <label className="flex h-12 min-w-0 flex-1 items-center rounded-button border-[1.5px] border-soil bg-card px-3.5">
            <input value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" aria-label="پیام به دستیار"
              placeholder={wilted ? "جست‌وجوی ساده…" : "بنویس چی می‌خوای…"} className="w-0 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stem" />
          </label>
          <button type="submit" disabled={busy || !text.trim()} aria-label="بفرست"
            className="flex size-12 flex-none items-center justify-center rounded-button bg-radish disabled:bg-line">
            {busy ? <Glasses width={26} color="#FFFFFF" blink /> : <ChevronForward size={22} color="#FFFFFF" />}
          </button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
}

export default function AssistantPage() {
  return <Suspense><Chat /></Suspense>;
}
