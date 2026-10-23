"use client";
// F8 Store page (Bebin Store.dc.html #12): header (+ real-name badge), where in the mall, week hours (today
// radish-tint, split shifts, closed in beet), payments, recent verifications, contact, product search.
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { BottomNav, useToasts } from "@/components/chrome";
import { Building, Check, ChevronForward, Info, Moon, NavAssistant, Route, Store } from "@/components/icons";
import { InMallCard } from "@/components/in-mall";
import { ImageBox } from "@/components/product-grid-card";
import { OpenStatusPill, Unknown } from "@/components/trust";
import { Glasses } from "@/components/brand";
import { api, type S, type ShopDetail } from "@/lib/api";
import { useComposer } from "@/lib/composer";
import { distance, duration, faDigits, faNum, jalaliDate } from "@/lib/format";
import { directionsUrl } from "@/lib/place";
import { useApp } from "@/lib/store";

type OffersOut = S["ShopOffersOut"];

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 px-4">
      <div className="flex items-baseline justify-between px-1"><h2 className="text-base font-bold">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

function Hours({ d }: { d: ShopDetail }) {
  if (!d.hours) return <div className="rounded-card bg-card p-3.5"><Unknown>ساعت کاری ثبت نشده</Unknown></div>;
  return (
    <div className="overflow-hidden rounded-card bg-card">
      {d.hours.map((h) => (
        <div key={h.weekday} className={`flex h-11 items-center gap-2 border-b border-line px-3.5 text-[13px] last:border-b-0 ${h.is_today ? "bg-radish-tint font-bold" : ""}`}>
          <span className="w-[62px]">{h.weekday_fa}</span>
          {h.is_today && <span className="text-[11px] font-bold">امروز</span>}
          <span className="flex-1 border-b-[1.5px] border-dotted border-line" />
          {h.ranges == null ? <Unknown size="sm">نامشخص</Unknown>
            : h.ranges.length === 0 ? <span className="flex items-center gap-[5px] font-semibold text-beet"><Moon size={13} />تعطیل</span>
              : <span className="tabular">{faDigits(h.ranges.map((r) => r.replace("–", " تا ")).join(" و "))}</span>}
        </div>
      ))}
    </div>
  );
}

function Payments({ d }: { d: ShopDetail }) {
  const p = d.payment;
  const rows: [string, boolean | null | undefined, string?][] = [
    ["اقساطی", p.installments, p.installment_types?.length ? p.installment_types.join("، ") : "دارد"],
    ["ترب‌پی", p.torob_pay], ["کالابرگ", p.kala_barg], ["ارسال فوری", p.fast_delivery],
  ];
  return (
    <div className="overflow-hidden rounded-card bg-card">
      {rows.map(([label, v, yes]) => (
        <div key={label} className="flex h-[46px] items-center gap-2.5 border-b border-line px-3.5 text-[13.5px] last:border-b-0">
          <span className="flex-1">{label}</span>
          {v === true ? <span className="flex items-center gap-[5px] text-[12.5px] font-semibold text-leaf-ink"><Check size={13} />{yes ?? "دارد"}</span>
            : v === false ? <span className="text-[12.5px] text-stem">ندارد</span>
              : <Unknown size="sm">نامشخص</Unknown>}
        </div>
      ))}
    </div>
  );
}

function Products({ d }: { d: ShopDetail }) {
  const [q, setQ] = useState("");
  const offers = useInfiniteQuery({
    queryKey: ["shop-offers", d.shop.id, q],
    queryFn: ({ pageParam }) => api<OffersOut>(`/shops/${d.shop.id}/offers`, { q, page: pageParam }),
    initialPageParam: 1, getNextPageParam: (l) => (l.has_more ? l.page + 1 : undefined), placeholderData: keepPreviousData,
  });
  const items = offers.data?.pages.flatMap((p) => p.items) ?? [];
  const total = offers.data?.pages[0]?.total ?? d.offer_count;
  return (
    <Section title="کالاهای این فروشگاه" aside={<span className="text-xs text-stem">{faNum(d.offer_count)} کالا در فهرست</span>}>
      <label className="flex h-[46px] items-center gap-2.5 rounded-button border-[1.5px] border-line bg-card px-3">
        <Glasses width={24} color="var(--color-stem)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`جست‌وجو در کالاهای ${d.shop.name}`}
          className="w-0 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stem" />
      </label>
      <div className="overflow-hidden rounded-card bg-card">
        {items.map((o) => {
          const stale = o.price.freshness === "stale";
          const date = jalaliDate(o.price.changed_at);
          return (
            <Link key={o.offer_id} href={`/product/${o.product_id}`} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
              <ImageBox src={o.image} className="size-11 flex-none rounded-[10px] p-0.5" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 text-[13px] leading-[1.6] font-semibold">{o.title}</span>
                {date && <span className={`text-[11.5px] ${stale ? "text-wilt" : "text-leaf-ink"}`}>{stale ? `قیمت قدیمی، ${date}` : `تغییر قیمت: ${date}`}</span>}
              </div>
              {o.price.value ? (
                <span className={`tabular text-[13px] whitespace-nowrap ${stale ? "font-semibold text-faded" : "font-extrabold"}`}>{faNum(o.price.value)}</span>
              ) : <span className="text-xs text-stem">قیمت ثبت نشده</span>}
            </Link>
          );
        })}
        {offers.data && !items.length && <p className="px-3.5 py-4 text-[13px] text-stem">در فهرست این فروشگاه پیدا نشد.</p>}
        {offers.hasNextPage && (
          <button type="button" onClick={() => offers.fetchNextPage()} className="flex h-11 w-full items-center justify-center text-[13px] font-semibold text-radish">
            {offers.isFetchingNextPage ? <Glasses width={24} blink /> : `کالاهای بیشتر (${faNum(total - items.length)})`}
          </button>
        )}
      </div>
    </Section>
  );
}

function ShopPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const loc = useApp((s) => s.location);
  const inPlan = useApp((s) => s.plan.some((p) => p.shopId === id));
  const togglePlan = useApp((s) => s.togglePlan);
  const push = useToasts((s) => s.push);
  const openComposer = useComposer((s) => s.open);
  const [copied, setCopied] = useState(false);
  const [showMall, setShowMall] = useState(false);
  const q = useQuery({
    queryKey: ["shop", id, loc?.lat, loc?.lng],
    queryFn: () => api<ShopDetail>(`/shops/${id}`, { lat: loc?.lat, lng: loc?.lng }),
  });
  const d = q.data;
  const plan = () => {
    if (!d) return;
    const added = togglePlan({ shopId: d.shop.id, shopName: d.shop.name, lat: d.shop.lat, lng: d.shop.lng,
      mallId: d.shop.location.mall?.id ?? null, productId: null, productTitle: null });
    if (added) push({ text: "به برنامه اضافه شد", icon: <Check size={16} color="var(--color-radish-night)" />, action: { label: "ببین", onClick: () => router.push("/plan") } });
  };
  const copy = () => d && navigator.clipboard?.writeText(d.address).then(() => setCopied(true), () => {});

  if (q.isError) {
    return (
      <div className="flex h-dvh flex-col">
        <main className="p-4"><div className="flex flex-col items-start gap-2 rounded-card bg-beet-tint p-4 text-sm text-beet">
          این فروشگاه پیدا نشد.<Link href="/" className="flex min-h-11 items-center font-bold text-radish">برگشت به خانه</Link>
        </div></main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <main className="no-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <header className="flex flex-col gap-2.5 border-b border-line bg-card px-5 pt-1 pb-[18px]">
          <div className="-ms-2 flex items-center justify-between">
            <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="برگشت" className="flex h-11 w-10 items-center justify-center">
              <ChevronForward size={22} className="rotate-180" />
            </button>
          </div>
          {!d ? <div className="flex flex-col gap-2" aria-busy><div className="h-7 w-1/2 rounded-full bg-line" /><div className="h-3 w-2/3 rounded-full bg-mist" /></div> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl leading-[1.4] font-extrabold">{d.shop.name}</h1>
                {d.shop.is_real_name && (
                  <span className="flex h-[26px] items-center gap-[5px] rounded-full border-[1.5px] border-soil ps-2 pe-[9px] text-[11.5px] font-semibold"><Store size={13} />فروشگاه واقعی</span>
                )}
              </div>
              {!!d.categories.length && <span className="text-[13px] text-stem">{d.categories.slice(0, 4).join("، ")}</span>}
              <div className="flex flex-wrap items-center gap-2">
                <OpenStatusPill status={d.open_status} />
                {d.distance_m != null && <span className="text-xs text-stem">{distance(d.distance_m)}{d.eta_min != null ? `، ${duration(d.eta_min)} پیاده، تخمینی` : ""}</span>}
              </div>
              {(d.instagram || d.website) && (
                <div className="flex flex-wrap gap-2">
                  {d.instagram && <a href={`https://instagram.com/${d.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener" className="flex h-[34px] items-center gap-1.5 rounded-full border-[1.5px] border-line px-3 text-[12.5px]"><bdi dir="ltr">@{d.instagram.replace(/^@/, "")}</bdi></a>}
                  {d.website && <a href={d.website.startsWith("http") ? d.website : `https://${d.website}`} target="_blank" rel="noopener" className="flex h-[34px] items-center gap-1.5 rounded-full border-[1.5px] border-line px-3 text-[12.5px]"><bdi dir="ltr">{d.website.replace(/^https?:\/\//, "")}</bdi></a>}
                </div>
              )}
              {d.shop.is_real_name && (
                <p className="text-[11.5px] leading-[1.7] text-stem">نشان «فروشگاه واقعی» یعنی نام این فروشگاه در داده‌ها واقعی است؛ چیزی درباره‌ی قیمت یا موجودی نمی‌گوید.</p>
              )}
            </>
          )}
        </header>

        {d && (
          <>
            <Section title={d.shop.location.mall ? "کجای پاساژ؟" : "نشانی"}>
              <div className="flex flex-col gap-3 rounded-card bg-card p-4">
                {d.shop.location.mall && (
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 flex-none items-center justify-center rounded-button bg-flesh"><Building size={22} /></span>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-bold">{d.shop.location.mall.name}</span>
                      {d.shop.location.state === "known"
                        ? <span className="text-[13px]">{faDigits([d.shop.location.floor_label, d.shop.location.unit && `واحد ${d.shop.location.unit}`].filter(Boolean).join("، "))}</span>
                        : <span className="self-start"><Unknown size="sm">طبقه و واحد ثبت نشده</Unknown></span>}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-button bg-flesh px-3 py-2.5">
                  <span className="flex-1 text-[12.5px] leading-[1.7]">{faDigits(d.address)}</span>
                  <button type="button" onClick={copy} className="hit flex h-[34px] items-center gap-[5px] rounded-[10px] border border-line bg-card px-2.5 text-xs font-semibold whitespace-nowrap">
                    {copied ? <><Check size={12} />کپی شد</> : "کپی"}
                  </button>
                </div>
                {d.shop.location.mall ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-expanded={showMall} onClick={() => setShowMall((v) => !v)}
                      className="flex h-11 items-center justify-center rounded-button border-[1.5px] border-radish text-[13.5px] font-bold text-radish">داخل پاساژ</button>
                    <Link href={`/mall/${d.shop.location.mall.id}?shop=${d.shop.id}`}
                      className="flex h-11 items-center justify-center rounded-button border-[1.5px] border-line text-[13.5px] font-semibold">صفحه‌ی پاساژ</Link>
                  </div>
                ) : (
                  <a href={directionsUrl(d.shop.lat, d.shop.lng)} target="_blank" rel="noopener"
                    className="flex h-11 items-center justify-center gap-2 rounded-button border-[1.5px] border-radish text-[13.5px] font-bold text-radish"><Route size={16} />مسیر</a>
                )}
              </div>
              {showMall && <InMallCard shop={d.shop} open={d.open_status} />}
            </Section>

            <Section title="ساعت کاری" aside={<span className="text-[11.5px] text-stem">ثبت‌شده توسط فروشگاه</span>}><Hours d={d} /></Section>
            <Section title="پرداخت و خدمات"><Payments d={d} /></Section>

            {!!d.verifications?.length && (
              <Section title="تأییدهای اخیر">
                <div className="overflow-hidden rounded-card bg-card">
                  {d.verifications.map((v, i) => (
                    <div key={i} className="flex items-center gap-2.5 border-b border-line bg-stamp-row px-3.5 py-3 text-[13px] font-semibold text-stamp last:border-b-0">
                      {String(v.text ?? "")}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="تماس">
              <div className="overflow-hidden rounded-card bg-card">
                {d.phone && (
                  <div className="flex h-12 items-center gap-3 border-b border-line px-3.5">
                    <span className="flex-1 text-[13.5px]">تلفن فروشگاه</span>
                    <span dir="ltr" className="text-[13px] text-stem">{faDigits(d.phone)}</span>
                  </div>
                )}
                <button type="button" onClick={() => openComposer({ productId: null, productTitle: null, shops: [{ id: d.shop.id, name: d.shop.name, open: d.open_status }] })}
                  className="flex h-12 w-full items-center gap-3 border-b border-line px-3.5 text-start">
                  <NavAssistant size={18} /><span className="flex-1 text-[13.5px]">پیام در ببین</span><ChevronForward size={14} color="var(--color-stem)" />
                </button>
                {d.phone_is_fictitious && (
                  <div className="flex items-start gap-2 bg-flesh px-3.5 py-2.5 text-[11.5px] leading-[1.7] text-stem"><Info size={14} />شماره‌ها در این نمونه واقعی نیستند؛ پیام‌ها از راه ببین می‌رسند.</div>
                )}
              </div>
            </Section>

            <Products d={d} />
          </>
        )}
      </main>
      {d && (
        <div className="flex flex-none gap-2 border-t border-line bg-card px-4 py-2.5">
          <button type="button" onClick={plan} aria-pressed={inPlan} aria-label={inPlan ? "در برنامه" : "به برنامه اضافه کن"}
            className={`flex size-[52px] flex-none items-center justify-center rounded-button border-[1.5px] ${inPlan ? "border-radish bg-radish-tint" : "border-line"}`}>
            {inPlan ? <Check size={18} color="var(--color-radish)" /> : <Route size={20} />}
          </button>
          <button type="button" onClick={() => openComposer({ productId: null, productTitle: null, shops: [{ id: d.shop.id, name: d.shop.name, open: d.open_status }] })}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-button bg-radish text-[15.5px] font-bold text-white">
            <NavAssistant size={18} color="#FFFFFF" />از فروشگاه بپرس
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  );
}

export default function ShopRoute() {
  return <Suspense><ShopPage /></Suspense>;
}
