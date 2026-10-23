"use client";
// Ask-the-store composer (Bebin Inquiry.dc.html 15a one store, 15b ask top 3, 15c closed now). The API decides
// which questions are pre-checked and why (hints); this sheet only edits the selection and sends.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type ComposeOut, type InquiryOut } from "@/lib/api";
import { useComposer, type ComposerTarget } from "@/lib/composer";
import { faNum } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Glasses } from "./brand";
import { BottomSheet, useToasts } from "./chrome";
import { Check, Close, Hourglass } from "./icons";
import { modelLine } from "./product-grid-card";

function Body({ target, data }: { target: ComposerTarget; data: ComposeOut }) {
  const close = useComposer((s) => s.close);
  const reopen = useComposer((s) => s.open);
  const loc = useApp((s) => s.location);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const qc = useQueryClient();
  const [checked, setChecked] = useState(() => new Set<string>(data.questions.filter((q) => q.checked).map((q) => q.key)));
  const alts = data.open_alternatives ?? [];
  const [recips, setRecips] = useState(data.recipients);
  const [detail, setDetail] = useState("");
  const [hold, setHold] = useState(data.hold_options[1] ?? data.hold_options[0] ?? "");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => api<InquiryOut[]>("/inquiries", undefined, {
      method: "POST",
      body: JSON.stringify({
        shop_ids: recips.map((r) => r.id), product_id: target.productId, questions: [...checked],
        detail: checked.has("stock") || checked.has("has_model") ? detail.trim() || null : null,
        hold_until: checked.has("hold") ? hold : null, note: note.trim() || null, lat: loc?.lat, lng: loc?.lng,
      }),
    }),
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      close();
      push({ text: out.length > 1 ? `پیام به ${faNum(out.length)} فروشنده رفت` : "پیام فرستاده شد" });
      router.push(out.length === 1 ? `/inquiries/${out[0].id}` : "/inquiries");
    },
  });
  const n = checked.size, k = recips.length, ok = n > 0 && k > 0;
  const toggle = (key: string) => setChecked((s) => { const x = new Set(s); if (x.has(key)) x.delete(key); else x.add(key); return x; });
  const model = data.product ? modelLine(data.product.title, data.product.model) : null;

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] text-stem">به:</span>
          {recips.map((r) => (
            <span key={r.id} className="flex h-8 items-center gap-1 rounded-full border border-line bg-flesh ps-3 pe-1.5 text-[13px] font-semibold">
              {r.name}
              {k > 1 && (
                <button type="button" onClick={() => setRecips((x) => x.filter((y) => y.id !== r.id))} aria-label={`حذف ${r.name}`}
                  className="hit flex size-[22px] items-center justify-center"><Close size={11} color="var(--color-stem)" /></button>
              )}
            </span>
          ))}
        </div>
        {data.product && (
          <span className="text-xs text-stem">درباره‌ی {model ? <bdi className="font-bold text-soil">{model}</bdi> : <b className="font-bold text-soil">{data.product.title}</b>}</span>
        )}
        {data.closed_note && (
          <>
            <div className="flex items-start gap-2 rounded-button bg-wilt-tint px-3 py-2.5">
              <Hourglass size={15} color="var(--color-wilt)" className="mt-1" />
              <span className="flex-1 text-[13px] leading-[1.75] font-semibold text-wilt">{data.closed_note}</span>
            </div>
            {!!alts.length && (
              <button type="button" className="hit self-start text-[12.5px] font-semibold text-radish"
                onClick={() => reopen({ ...target, shops: alts.map((r) => ({ id: r.id, name: r.name, open: r.open_now })) })}>
                یا از {faNum(alts.length)} فروشگاهِ باز بپرس
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col">
        {data.questions.map((q) => {
          const on = checked.has(q.key);
          return (
            <div key={q.key} className="flex items-start gap-3 border-b border-line py-3">
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(q.key)} className="flex flex-1 items-start gap-3 text-start">
                <span className={`mt-0.5 flex size-[22px] flex-none items-center justify-center rounded-md border-[1.5px] ${on ? "border-radish bg-radish" : "border-leader bg-card"}`}>
                  {on && <Check size={13} color="#FFFFFF" sw={3.4} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14.5px] font-medium">{q.label}</span>
                  <span className="text-[11.5px] leading-[1.6] text-stem">{q.hint}</span>
                </span>
              </button>
              {on && q.field === "detail" && (
                <label className="mt-1 flex items-center gap-2">
                  <span className="text-[12.5px] text-stem">سایز/رنگ:</span>
                  <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={60}
                    className="h-9 w-[110px] rounded-[10px] border-[1.5px] border-radish px-2.5 text-sm font-bold outline-none" />
                </label>
              )}
              {on && q.field === "hold" && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data.hold_options.map((h) => (
                    <button key={h} type="button" aria-pressed={hold === h} onClick={() => setHold(h)}
                      className={`hit flex h-8 items-center rounded-full border-[1.5px] px-3 text-[12.5px] ${hold === h ? "border-radish bg-radish-tint font-bold" : "border-line"}`}>
                      تا {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="یادداشت اختیاری برای فروشنده"
          className="mt-3 h-[46px] w-full rounded-button border-[1.5px] border-line bg-flesh px-3 text-sm outline-none placeholder:text-stem" />
        {send.isError && <p className="mt-2 text-[13px] text-beet">پیام نرفت؛ دوباره امتحان کن.</p>}
      </div>
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-line bg-card px-4 pt-2.5">
        <span className="text-center text-[11.5px] text-stem">{data.eta_note}</span>
        <button type="button" disabled={!ok || send.isPending} onClick={() => send.mutate()}
          className="flex h-[54px] items-center justify-center gap-2 rounded-button bg-radish text-base font-bold text-white disabled:bg-line disabled:text-stem">
          {send.isPending ? <Glasses width={30} color="#FFFFFF" blink />
            : !ok ? "دست‌کم یک سؤال انتخاب کن"
              : `${k > 1 ? `به ${faNum(k)} فروشنده بفرست` : "بفرست"}، ${faNum(n)} سؤال`}
        </button>
      </div>
    </>
  );
}

/** Mounted once in Providers; any «بپرس» opens it through `useComposer`. */
export function ComposerHost() {
  const target = useComposer((s) => s.target);
  const close = useComposer((s) => s.close);
  const loc = useApp((s) => s.location);
  const q = useQuery({
    queryKey: ["compose", target?.shops.map((s) => s.id).join(","), target?.productId, target?.preset?.join(",")],
    queryFn: () => api<ComposeOut>("/inquiries/compose", {
      shop_ids: target!.shops.map((s) => s.id), product_id: target!.productId, preset: target!.preset ?? [], lat: loc?.lat, lng: loc?.lng,
    }),
    enabled: !!target, staleTime: 30_000,
  });
  if (!target) return null;
  const multi = target.shops.length > 1;
  return (
    <BottomSheet open onClose={close} top={multi ? 72 : 96} title={q.data?.title ?? (multi ? `از ${faNum(target.shops.length)} فروشنده بپرس` : "از فروشگاه بپرس")}>
      {q.data ? <Body key={q.data.recipients.map((r) => r.id).join(",")} target={target} data={q.data} />
        : q.isError ? <p className="py-6 text-center text-sm text-beet">باز نشد؛ دوباره امتحان کن.</p>
          : <div className="flex justify-center py-10"><Glasses width={44} blink /></div>}
    </BottomSheet>
  );
}
