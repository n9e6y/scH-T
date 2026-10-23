"use client";
// F3 Search (design: Bebin Search.dc.html 4a–7). All state lives in the URL; the API echoes `applied`.
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Glasses } from "@/components/brand";
import { BottomNav } from "@/components/chrome";
import { CompareTray } from "@/components/compare-tray";
import { Check, ChevronDown, ChevronForward, Close } from "@/components/icons";
import { GridCard } from "@/components/product-grid-card";
import { FilterSheet } from "@/components/search/filter-sheet";
import { EmptyResults, LoadingGrid, UnknownNotice } from "@/components/search/states";
import { api, type NeedOption, type NeedQuestion, type RelaxOption, type SearchOut } from "@/lib/api";
import { faNum, priceShort } from "@/lib/format";
import { useCategories } from "@/lib/queries";
import { apiParams, fromApplied, searchHref, SORTS, type Filters } from "@/lib/search-url";
import { useApp } from "@/lib/store";

const PAY_LABEL: Record<string, string> = { installments: "اقساطی", torob_pay: "ترب‌پی", kala_barg: "کالابرگ" };

function priceLabel(f: Filters): string | null {
  if (f.min != null && f.max != null) return `قیمت: ${priceShort(f.min)} تا ${priceShort(f.max)}`;
  if (f.max != null) return `قیمت: تا ${priceShort(f.max)}`;
  if (f.min != null) return `قیمت: از ${priceShort(f.min)}`;
  return null;
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function FilterChip({ on, label, caret, onClick }: { on: boolean; label: string; caret?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`hit flex h-9 flex-none items-center gap-[5px] rounded-full border-[1.5px] px-3 text-[13px] whitespace-nowrap ${
        on ? "border-radish bg-radish-tint font-semibold" : "border-line bg-card"}`}>
      {on && <Check size={12} color="var(--color-radish)" sw={3.2} />}
      {label}
      {caret && <ChevronDown size={12} color="var(--color-stem)" />}
    </button>
  );
}

/** Need-finder (4a/4b): one question at a time; answers become filters and collapse into a line. */
function NeedFinder({ questions, answers, onAnswer, onSkip, onChange }: {
  questions: NeedQuestion[]; answers: Record<string, { label: string; question: string }>;
  onAnswer: (q: NeedQuestion, o: NeedOption) => void; onSkip: (q: NeedQuestion) => void; onChange: (key: string) => void;
}) {
  const open = questions.filter((q) => !answers[q.key]);
  const done = Object.entries(answers);
  const q = open[0];
  if (!q && !done.length) return null;
  return (
    <div className="flex flex-col gap-2 px-4">
      {done.map(([key, a]) => (
        <div key={key} className="flex h-11 items-center gap-2 rounded-button border border-line bg-card px-3.5">
          <Check size={15} sw={2.8} />
          <span className="flex-1 text-[13px]"><span className="text-stem">{a.question}:</span> <b className="font-bold">{a.label}</b></span>
          <button type="button" onClick={() => onChange(key)} className="hit px-0.5 py-1.5 text-[13px] font-semibold text-radish">تغییر</button>
        </div>
      ))}
      {q && (
        <div className="flex flex-col gap-2.5 rounded-card border border-line bg-card px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Glasses width={24} />
            <span className="flex-1 text-sm font-bold">{q.question}</span>
            <span className="text-[11.5px] text-stem">سؤال {faNum(done.length + 1)} از {faNum(done.length + open.length)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {q.options.map((o) => (
              <button key={o.label} type="button" onClick={() => onAnswer(q, o)}
                className="flex h-9 items-center rounded-full border-[1.5px] border-line bg-card px-3.5 text-[13.5px] font-medium hover:border-radish">
                <bdi>{o.label}</bdi>
              </button>
            ))}
            <button type="button" onClick={() => onSkip(q)} className="hit ms-auto h-9 px-2 text-[13px] text-stem">رد شو</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({ q }: { q: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const cats = useCategories();
  const ignKey = sp.getAll("ign").join("|");
  const spKey = sp.toString();
  const [text, setText] = useState(q);
  const [sheet, setSheet] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { label: string; question: string }>>({});

  const query = useInfiniteQuery({
    queryKey: ["search", spKey, loc?.lat, loc?.lng],
    queryFn: ({ pageParam }) => api<SearchOut>("/search", { ...apiParams(new URLSearchParams(spKey), loc), page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const first = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const applied = useMemo(() => (first ? fromApplied(first.applied) : null), [first]);
  const chips = useMemo(() => first?.understood_chips ?? [], [first]);
  const areaActive = chips.some((c) => c.key === "area" || c.key === "near");
  const ctx = useMemo(() => ({ chips, ign: ignKey ? ignKey.split("|") : [], areaActive }), [chips, ignKey, areaActive]);
  const originLabel = first?.applied.area ?? loc?.name ?? null;

  const go = (f: Filters, extraIgn: string[] = []) => router.push(searchHref(q, f, ctx, extraIgn), { scroll: false });
  const removeChip = (id: string) => {
    if (!applied) return;
    const c = chips.find((x) => x.id === id)!;
    const f = { ...applied };
    if (c.key === "max") f.max = null;
    else if (c.key === "min") f.min = null;
    else if (c.key === "pay") f.pay = f.pay.filter((p) => p !== c.value);
    else if (c.key === "open") f.open = false;
    else if (c.key === "brand") f.brand = [];
    else if (c.key === "area" || c.key === "near") f.radius = null;
    go(f, [id]);
  };
  const relax = (o: RelaxOption) => {
    if (!applied) return;
    const f = { ...applied };
    if (o.key === "pay") f.pay = f.pay.filter((p) => p !== o.value);
    else if (o.key === "max") f.max = null;
    else if (o.key === "min") f.min = null;
    else if (o.key === "open") f.open = false;
    else if (o.key === "fast") f.fast = false;
    else if (o.key === "radius") f.radius = null;
    else if (o.key === "brand") f.brand = [];
    else if (o.key === "unknown") f.unk = true;
    go(f);
  };
  const answer = (nq: NeedQuestion, o: NeedOption) => {
    if (!applied) return;
    setAnswers((a) => ({ ...a, [nq.key]: { label: o.label, question: nq.label } }));
    go(nq.key === "brand" ? { ...applied, brand: o.brand ? [o.brand] : [] }
      : nq.key === "use" ? { ...applied, boost: o.boost ?? [] }
        : { ...applied, min: o.min ?? null, max: o.max ?? null });
  };
  const changeAnswer = (key: string) => {
    const wasSkip = answers[key]?.label === "مهم نیست";
    setAnswers(({ [key]: _, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!applied || wasSkip) return;
    go(key === "brand" ? { ...applied, brand: [] } : key === "use" ? { ...applied, boost: [] } : { ...applied, min: null, max: null });
  };

  const catLabel = applied?.cat ? (cats.data?.find((c) => c.key === applied.cat)?.label ?? first?.facets?.category?.find((c) => c.key === applied.cat)?.label ?? applied.cat) : null;
  const activeLabels = applied ? [
    priceLabel(applied), ...applied.pay.map((p) => PAY_LABEL[p]), applied.open && "الان باز", applied.fast && "ارسال فوری",
    applied.radius != null && `تا ${faNum(applied.radius)} کیلومتر`, ...applied.brand, catLabel,
  ].filter(Boolean) as string[] : [];
  const unknownCounts = Object.fromEntries(Object.entries(first?.unknown_sellers ?? {}).filter(([k]) =>
    applied && (applied.pay.includes(k) || (k === "open" && applied.open) || (k === "fast_delivery" && applied.fast))));

  return (
    <div className="flex h-dvh flex-col">
      <form role="search" className="flex flex-none items-center gap-1.5 ps-4 pe-3 pt-1 pb-2"
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) router.push(`/search?q=${encodeURIComponent(text.trim())}`); }}>
        <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="برگشت"
          className="flex h-11 w-10 flex-none items-center justify-center">
          <ChevronForward size={22} className="rotate-180" />
        </button>
        <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-button border-[1.5px] border-soil bg-card px-3">
          <Glasses width={26} />
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="جست‌وجوی کالا" enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] font-medium outline-none" placeholder={catLabel ?? "چی می‌خوای؟"} />
          {text && (
            <button type="button" onClick={() => setText("")} aria-label="پاک کردن" className="hit flex size-6 flex-none items-center justify-center">
              <Close size={16} color="var(--color-stem)" />
            </button>
          )}
        </label>
      </form>

      {!first && query.isLoading && <main className="flex-1 overflow-hidden"><LoadingGrid where={originLabel} /></main>}
      {query.isError && !first && (
        <main className="flex flex-1 flex-col items-start gap-2 p-4">
          <div className="flex w-full flex-col items-start gap-2 rounded-card bg-beet-tint p-4 text-sm text-beet">
            جست‌وجو انجام نشد.
            <button type="button" onClick={() => query.refetch()} className="min-h-11 font-bold text-radish">دوباره امتحان کن</button>
          </div>
        </main>
      )}

      {first && applied && first.total === 0 && <EmptyResults data={first} activeLabels={activeLabels} onRelax={relax} />}

      {first && applied && first.total > 0 && (
        <main className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pb-5">
          {!!chips.length && (
            <div className="flex flex-wrap items-center gap-1.5 px-4">
              <span className="me-0.5 text-xs text-stem">این‌طور فهمیدم:</span>
              {chips.map((c) => (
                <span key={c.id} className="flex h-8 items-center gap-0.5 rounded-full bg-radish-tint ps-2.5 pe-1 text-[13px] font-semibold">
                  <bdi>{c.label}</bdi>
                  <button type="button" onClick={() => removeChip(c.id)} aria-label={`حذف «${c.label}»`}
                    className="hit flex size-[26px] items-center justify-center rounded-full hover:bg-beet-tint">
                    <Close size={11} sw={3.2} color="var(--color-stem)" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <NeedFinder questions={first.needfinder ?? []} answers={answers} onAnswer={answer} onChange={changeAnswer}
            onSkip={(nq) => setAnswers((a) => ({ ...a, [nq.key]: { label: "مهم نیست", question: nq.label } }))} />

          <div className="no-scrollbar flex flex-none gap-1.5 overflow-x-auto px-4 py-1">
            <FilterChip on={applied.min != null || applied.max != null} label={priceLabel(applied) ?? "قیمت"} caret onClick={() => setSheet(true)} />
            {(["installments", "torob_pay", "kala_barg"] as const).map((k) => (
              <FilterChip key={k} on={applied.pay.includes(k)} label={PAY_LABEL[k]}
                onClick={() => go({ ...applied, pay: applied.pay.includes(k) ? applied.pay.filter((p) => p !== k) : [...applied.pay, k] })} />
            ))}
            <FilterChip on={applied.open} label="الان باز" onClick={() => go({ ...applied, open: !applied.open })} />
            <FilterChip on={applied.radius != null} label={applied.radius != null ? `تا ${faNum(applied.radius)} کیلومتر` : "فاصله"} caret onClick={() => setSheet(true)} />
            <FilterChip on={applied.brand.length > 0} caret onClick={() => setSheet(true)}
              label={applied.brand.length === 1 ? applied.brand[0] : applied.brand.length ? `برند (${faNum(applied.brand.length)})` : "برند"} />
            <button type="button" onClick={() => setSheet(true)}
              className="hit flex h-9 flex-none items-center gap-1.5 rounded-full border-[1.5px] border-soil bg-card px-3 text-[13px] font-semibold whitespace-nowrap">
              <FilterIcon />همه فیلترها
              {!!activeLabels.length && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-radish px-1 text-[10.5px] font-bold text-white">{faNum(activeLabels.length)}</span>
              )}
            </button>
          </div>

          <div role="tablist" aria-label="مرتب‌سازی" className="no-scrollbar flex flex-none items-center gap-1 overflow-x-auto border-b border-line px-3">
            {SORTS.map(([k, l]) => {
              const on = applied.sort === k;
              return (
                <button key={k} type="button" role="tab" aria-selected={on} onClick={() => go({ ...applied, sort: k })}
                  className={`-mb-px flex h-10 items-center border-b-[2.5px] px-2 text-[13px] whitespace-nowrap ${on ? "border-radish font-bold text-radish" : "border-transparent text-stem"}`}>
                  {l}
                </button>
              );
            })}
          </div>

          {!!Object.keys(unknownCounts).length && (
            <UnknownNotice counts={unknownCounts} shown={applied.unk} onToggle={() => go({ ...applied, unk: !applied.unk })} />
          )}

          <div className="flex items-baseline justify-between gap-3 px-5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              {faNum(first.total)} کالا{query.isFetching && !query.isFetchingNextPage && <Glasses width={20} blink />}
            </span>
            <span className="text-[11.5px] text-stem">قیمت‌ها از فهرست فروشگاه‌هاست؛ موجودی را باید پرسید.</span>
          </div>

          <div className={`grid grid-cols-2 gap-2.5 px-4 transition-opacity ${query.isPlaceholderData ? "opacity-60" : ""}`}>
            {items.map((p) => <GridCard key={p.id} p={p} />)}
          </div>
          {query.hasNextPage && (
            <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}
              className="mx-4 flex h-12 items-center justify-center gap-2 rounded-button border-[1.5px] border-radish text-sm font-bold text-radish">
              {query.isFetchingNextPage ? <Glasses width={26} blink /> : `کالاهای بیشتر (${faNum(first.total - items.length)})`}
            </button>
          )}
        </main>
      )}

      {first && applied && sheet && (
        <FilterSheet open onClose={() => setSheet(false)} q={q} applied={applied} ctx={ctx} data={first}
          originLabel={originLabel} onApply={(f) => go(f)} />
      )}
      <CompareTray />
      <BottomNav />
    </div>
  );
}

/** A new query text starts fresh (input text, need-finder answers). */
function Keyed() {
  const q = useSearchParams().get("q") ?? "";
  return <Results key={q} q={q} />;
}

export default function SearchPage() {
  return <Suspense><Keyed /></Suspense>;
}
