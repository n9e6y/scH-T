"use client";
// F5 Product detail (Bebin Product.dc.html #8): gallery, listed range, dashed trust line, key specs receipt,
// top 3 sellers, similar strip; sticky save · compare · «از ۳ فروشنده‌ی برتر بپرس».
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BottomNav, useToasts } from "@/components/chrome";
import { CompareTray } from "@/components/compare-tray";
import { Check, ChevronDown, ChevronForward, NavAssistant } from "@/components/icons";
import { Bookmark, ImageBox, modelLine, Plus } from "@/components/product-grid-card";
import { FreshnessTag } from "@/components/trust";
import { api, type ProductCard, type ProductDetail, type SellersOut } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { distance, faDigits, faNum, faText, tomanRange } from "@/lib/format";
import { placeLine } from "@/lib/place";
import { useApp } from "@/lib/store";

const UnknownDot = () => (
  <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-ash text-[11px] font-bold text-stem">؟</span>
);

function Gallery({ images, onBack }: { images: string[]; onBack: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const push = useToasts((s) => s.push);
  const share = () => {
    if (navigator.share) navigator.share({ url: location.href, title: document.title }).catch(() => {});
    else navigator.clipboard?.writeText(location.href).then(() => push({ text: "لینک کالا کپی شد" }), () => {});
  };
  return (
    <div className="relative h-[300px] flex-none bg-card">
      {images.length ? (
        <div ref={ref} dir="ltr" className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {images.map((src, n) => (
            // The first image is the LCP element: fetch it first; the rest wait until swiped near.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading={n ? "lazy" : "eager"} fetchPriority={n ? "auto" : "high"}
              className="h-full w-full flex-none snap-center object-contain p-6" />
          ))}
        </div>
      ) : (
        <ImageBox src={null} className="size-full" />
      )}
      <div className="absolute inset-x-3 top-2 flex justify-between">
        <button type="button" onClick={onBack} aria-label="برگشت" className="flex size-11 items-center justify-center rounded-full bg-card shadow-hair">
          <ChevronForward size={22} className="rotate-180" />
        </button>
        {(
          <button type="button" onClick={share} aria-label="اشتراک‌گذاری" className="flex size-11 items-center justify-center rounded-full bg-card shadow-hair">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
            </svg>
          </button>
        )}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {images.slice(0, 8).map((src, k) => (
            <span key={src} className={`h-1.5 rounded-full ${k === i ? "w-[18px] bg-soil" : "w-1.5 bg-leader"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function Receipt({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <>
      {rows.map(({ k, v }) => (
        <div key={k} className="flex items-center gap-2 border-b border-line px-3.5 py-[11px] text-[13px]">
          <span className="max-w-[45%] text-stem">{k}</span>
          <span className="mb-1.5 min-w-3 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
          <bdi className="max-w-[50%] text-end font-semibold">{v}</bdi>
        </div>
      ))}
    </>
  );
}

function SimilarCard({ p }: { p: ProductCard }) {
  const model = modelLine(p.title, p.model);
  return (
    <Link href={`/product/${p.id}`} className="flex w-[168px] flex-none flex-col overflow-hidden rounded-card bg-card">
      <ImageBox src={p.image} className="h-[104px] w-full p-2" />
      <div className="flex flex-1 flex-col gap-[3px] px-3 pt-2.5 pb-3">
        <span className="line-clamp-2 text-[12.5px] leading-[1.6] font-semibold">{model ? <bdi dir="ltr">{model}</bdi> : p.title}</span>
        {p.price_range.min ? (
          <span className="tabular text-[13px] font-extrabold">
            {p.price_range.max && p.price_range.max !== p.price_range.min ? "از " : ""}{faNum(p.price_range.min)} <span className="text-[10.5px] font-medium">تومان</span>
          </span>
        ) : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
        <span className="text-[11.5px] text-stem">{faNum(p.seller_count)} فروشنده</span>
        {!!p.reasons?.length && (
          <span className="mt-auto border-t-[1.5px] border-dotted border-line pt-1.5 text-[11.5px] leading-[1.6]">
            <b className="font-bold text-radish">چرا مشابه؟</b> {faDigits(p.reasons.join("، "))}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function ProductPageRoute() {
  return <Suspense><ProductPage /></Suspense>;
}

function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const saved = useApp((s) => s.saved.includes(id));
  const inCompare = useApp((s) => s.compare.some((c) => c.id === id));
  const { toggleSaved, toggleCompare, setLastViewed } = useApp.getState();
  const openComposer = useComposer((s) => s.open);
  const [allSpecs, setAllSpecs] = useState(false);

  const detail = useQuery({ queryKey: ["product", id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
  const sellers = useQuery({
    queryKey: ["sellers", id, "balanced", loc?.lat, loc?.lng, "", false],
    queryFn: () => api<SellersOut>(`/products/${id}/sellers`, { lat: loc?.lat, lng: loc?.lng }),
  });
  // Similar products (and their 100–300 KB images) load only when the strip nears the viewport: fetched
  // up front they competed with the hero image and pushed mobile LCP to ~5 s (Lighthouse).
  const [similarNear, setSimilarNear] = useState(false);
  const similarSentinel = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSimilarNear(true); io.disconnect(); } },
      { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const similar = useQuery({
    queryKey: ["similar", id, loc?.lat], queryFn: () => api<ProductCard[]>(`/products/${id}/similar`, { k: 8, lat: loc?.lat, lng: loc?.lng }),
    enabled: similarNear,
  });
  const p = detail.data;
  useEffect(() => {
    if (p) setLastViewed({ id: p.id, title: p.title, min: p.price_range.min ?? null, max: p.price_range.max ?? null, sellers: p.seller_count, image: p.images[0] ?? null });
  }, [p, setLastViewed]);

  if (detail.isError) {
    return (
      <div className="flex h-dvh flex-col">
        <main className="flex flex-1 flex-col items-start gap-2 p-4">
          <div className="flex w-full flex-col items-start gap-2 rounded-card bg-beet-tint p-4 text-sm text-beet">
            این کالا پیدا نشد.
            <Link href="/" className="flex min-h-11 items-center font-bold text-radish">برگشت به خانه</Link>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const top = sellers.data?.listed.slice(0, 3) ?? [];
  const nearest = sellers.data?.listed.reduce<number | null>((m, r) => (r.distance_m != null && (m == null || r.distance_m < m) ? r.distance_m : m), null);
  const range = p && tomanRange(p.price_range.min, p.price_range.max);
  const model = p && modelLine(p.title, p.model);
  const specRows = p ? (allSpecs ? p.specs : p.key_specs.slice(0, 6)).map((s) => ({ k: s.key, v: faText(s.value) })) : [];
  const askTop = () => p && openComposer({
    productId: p.id, productTitle: p.title,
    shops: top.map((r) => ({ id: r.shop.id, name: r.shop.name, open: r.open_now })),
  });

  return (
    <div className="flex h-dvh flex-col">
      <main className="no-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <Gallery images={p?.images ?? []} onBack={() => (history.length > 1 ? router.back() : router.push("/"))} />
        {!p ? (
          <div className="flex flex-col gap-3 px-5" aria-busy>
            <div className="h-3 w-1/3 rounded-full bg-line" /><div className="h-5 w-4/5 rounded-full bg-line" />
            <div className="h-6 w-2/3 rounded-full bg-line" /><div className="h-3 w-1/2 rounded-full bg-mist" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 px-5">
              {(p.brand || model) && (
                <bdi dir="ltr" className="block text-start text-[12.5px] font-semibold text-stem">{[p.brand, model].filter(Boolean).join(" · ")}</bdi>
              )}
              <h1 className="text-xl leading-[1.6] font-bold">{p.title}</h1>
              <span className="mt-1.5 text-xs text-stem">قیمت ثبت‌شده در فروشگاه‌ها</span>
              {range ? (
                <span className={`tabular text-[22px] leading-normal ${p.freshest === "stale" ? "font-semibold text-faded" : "font-extrabold"}`}>
                  {range} <span className="text-[13px] font-medium">تومان</span>
                </span>
              ) : <span className="text-base text-stem">قیمت ثبت نشده</span>}
              <span className="text-[13px] text-stem">
                {faNum(p.seller_count)} فروشنده در فهرست{nearest != null ? `، نزدیک‌ترین ${distance(nearest)}` : ""}
              </span>
              <div className="mt-2.5 flex items-start gap-2 rounded-button border-[1.5px] border-dashed border-ash px-3 py-2.5">
                <UnknownDot /><span className="text-[13px] leading-[1.8]">{p.trust_summary}</span>
              </div>
            </div>

            {!!p.key_specs.length && (
              <section className="flex flex-col gap-2.5 px-4">
                <h2 className="px-1 text-base font-bold">مشخصات اصلی</h2>
                <div className="overflow-hidden rounded-card bg-card">
                  <Receipt rows={specRows} />
                  {p.specs.length > 6 && (
                    <button type="button" onClick={() => setAllSpecs((v) => !v)} aria-expanded={allSpecs}
                      className="flex h-[46px] w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-radish">
                      {allSpecs ? "مشخصات کمتر" : `همه مشخصات (${faNum(p.specs.length)})`}
                      <ChevronDown size={14} className={allSpecs ? "rotate-180" : ""} />
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2.5 px-4">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-base font-bold">فروشنده‌های برتر</h2>
                <span className="text-[11.5px] text-stem">ترتیب: متعادل</span>
              </div>
              <div className="overflow-hidden rounded-card bg-card">
                {sellers.isLoading && [0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-2 border-b border-line px-3.5 py-3.5" aria-busy>
                    <div className="flex items-center justify-between gap-3">
                      <span className="h-3.5 w-28 rounded-full bg-line" />
                      <span className="h-3.5 w-24 rounded-full bg-line" />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="h-3 w-44 rounded-full bg-mist" />
                      <span className="h-6 w-16 rounded-full bg-mist" />
                    </div>
                  </div>
                ))}
                {top.map((r) => (
                  <Link key={r.shop.id} href={`/product/${id}/sellers`} className="flex flex-col gap-1.5 border-b border-line px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-bold">{r.shop.name}</span>
                      <span className="mb-[7px] min-w-3 flex-1 self-end border-b-[1.5px] border-dotted border-leader" />
                      {r.price.value ? (
                        <span className={`tabular text-[14.5px] whitespace-nowrap ${r.price.freshness === "stale" ? "font-semibold text-faded" : "font-extrabold"}`}>
                          {faNum(r.price.value)} <span className="text-[11px] font-medium">تومان</span>
                        </span>
                      ) : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex-1 text-xs text-stem">{[distance(r.distance_m), placeLine(r.shop)].filter(Boolean).join("، ")}</span>
                      {r.price.value && <FreshnessTag price={r.price} compact />}
                    </div>
                  </Link>
                ))}
                {!!sellers.data && (
                  <Link href={`/product/${id}/sellers`} className="flex h-[46px] items-center justify-center gap-1 text-[13.5px] font-semibold text-radish">
                    همه فروشنده‌ها ({faNum(sellers.data.listed.length)})<ChevronForward size={14} />
                  </Link>
                )}
              </div>
            </section>

            <div ref={similarSentinel} aria-hidden />
            {!!similar.data?.length && (
              <section className="flex flex-col gap-2.5">
                <h2 className="px-5 text-base font-bold">کالاهای مشابه</h2>
                <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
                  {similar.data.map((s) => <SimilarCard key={s.id} p={s} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <CompareTray />
      {p && (
        <div className="flex flex-none gap-2 border-t border-line bg-card px-4 py-2.5">
          <button type="button" onClick={() => toggleSaved(p.id)} aria-pressed={saved} aria-label={saved ? "از ذخیره‌ها بردار" : "ذخیره کن"}
            className="flex size-[52px] flex-none items-center justify-center rounded-button border-[1.5px] border-line">
            <Bookmark filled={saved} size={20} />
          </button>
          <button type="button" aria-pressed={inCompare} aria-label={inCompare ? "از مقایسه بردار" : "به مقایسه اضافه کن"}
            onClick={() => toggleCompare({ id: p.id, title: p.title, model: p.model ?? null, image: p.images[0] ?? null })}
            className={`flex size-[52px] flex-none items-center justify-center rounded-button border-[1.5px] ${inCompare ? "border-radish bg-radish-tint" : "border-line"}`}>
            {inCompare ? <Check size={18} color="var(--color-radish)" /> : <Plus size={18} />}
          </button>
          <button type="button" onClick={askTop} disabled={!top.length}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-button bg-radish text-[15.5px] font-bold text-white disabled:bg-line disabled:text-stem">
            <NavAssistant size={18} color="#FFFFFF" />
            {top.length > 1 ? `از ${faNum(top.length)} فروشنده‌ی برتر بپرس` : "از فروشنده بپرس"}
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
