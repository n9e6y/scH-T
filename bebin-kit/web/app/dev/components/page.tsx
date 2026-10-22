"use client";
// Hidden gallery of every trust-component variant (MILESTONES M3), checked against the identity board.
import { Glasses, Lockup, Mascot, MiniStamp, TorobWordmark } from "@/components/brand";
import { OpenStatusPill, PaymentBadges, PriceBlock, ReasonLine, SimulatedLabel, StockTag, TierLabel, VerifiedStamp } from "@/components/trust";
import type { OpenStatus, Payment, Price } from "@/lib/api";

const listed: Price = { value: 3650000, kind: "listed", freshness: "fresh", changed_at: "2026-10-19T08:00:00+00:00" };
const stale: Price = { value: 3790000, kind: "listed", freshness: "stale", changed_at: "2026-09-24T08:00:00+00:00" };
const verified: Price = { ...listed, value: 3700000, kind: "verified", verified_at: "2026-10-21T14:22:00+00:00", listed_value: 3650000 };
const none: Price = { value: null, kind: "none" };
const at = "2026-10-21T17:40:00+03:30";
const status = (state: OpenStatus["state"], label_fa: string): OpenStatus => ({ state, label_fa, at });
const known: Payment = { installments: true, torob_pay: true, kala_barg: true, fast_delivery: true, installment_types: [] };
const unknown: Payment = { installments: null, torob_pay: null, kala_barg: null, fast_delivery: null, installment_types: [] };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold text-stem">{title}</h2>
      <div className="flex flex-col items-start gap-3.5 rounded-card bg-card p-4">{children}</div>
    </section>
  );
}

export default function DevComponents() {
  return (
    <main className="flex flex-col gap-7 p-4 pb-16">
      <h1 className="text-title font-bold">Trust components</h1>
      <Block title="Brand">
        <Lockup /><Glasses width={60} /><Glasses width={60} blink /><TorobWordmark color="var(--color-stem)" />
        <div className="flex items-end gap-3">
          <Mascot pose="default" scale={2} /><Mascot pose="searching" scale={2} /><Mascot pose="confused" scale={2} /><Mascot pose="wilted" scale={2} />
        </div>
      </Block>
      <Block title="PriceBlock">
        <PriceBlock price={listed} /><PriceBlock price={stale} /><PriceBlock price={verified} />
        <div className="w-full"><PriceBlock price={none} onAsk={() => {}} /></div>
      </Block>
      <Block title="StockTag">
        <StockTag stock={{ state: "unknown" }} onAsk={() => {}} />
        <StockTag stock={{ state: "in_stock", verified_at: "2026-10-21T14:22:00+00:00" }} detail="سایز ۴۳" />
        <StockTag stock={{ state: "out_of_stock", verified_at: "2026-10-21T14:22:00+00:00" }} />
      </Block>
      <Block title="OpenStatus">
        <OpenStatusPill status={status("open", "باز است، تا 21:00")} />
        <OpenStatusPill status={status("closing_soon", "45 دقیقه دیگر می‌بندد")} />
        <OpenStatusPill status={status("closed", "بسته است، فردا 10:00 باز می‌شود")} />
        <OpenStatusPill status={status("unknown", "ساعت کاری نامشخص")} />
      </Block>
      <Block title="PaymentBadges · known / unknown / false">
        <PaymentBadges payment={known} /><PaymentBadges payment={unknown} />
        <PaymentBadges payment={{ ...unknown, installments: false, torob_pay: true }} showFalse />
      </Block>
      <Block title="TierLabel · SimulatedLabel · ReasonLine">
        <div className="flex gap-2"><TierLabel tier="listed" /><TierLabel tier="related" /></div>
        <SimulatedLabel />
        <ReasonLine reasons={["ارزان‌ترین قیمت ثبت‌شده", "۸۰۰ متر تا اینجا", "اقساطی"]} />
      </Block>
      <Block title="VerifiedStamp">
        <div className="flex items-center gap-6"><VerifiedStamp time="17:52" caption="کفش آریا · ۲۹ مهر" land />
          <div className="flex flex-col items-center gap-4"><MiniStamp size={40} /><MiniStamp size={24} /></div>
        </div>
      </Block>
    </main>
  );
}
