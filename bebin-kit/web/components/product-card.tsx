// ProductCard from the identity board: listed range only; stock stays unknown on product level.
import type { ProductCard as Card } from "@/lib/api";
import { faNum, tomanRange } from "@/lib/format";
import { ReasonLine, Unknown } from "./trust";

export function ProductCard({ p }: { p: Card }) {
  const range = tomanRange(p.price_range.min, p.price_range.max);
  return (
    <article className="flex gap-3 rounded-card bg-card p-3">
      {p.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" width={104} height={120} loading="lazy"
          className="h-[120px] w-[104px] flex-none rounded-button bg-placeholder object-contain" />
      ) : (
        <span className="h-[120px] w-[104px] flex-none rounded-button bg-[repeating-linear-gradient(135deg,#EEF1EE_0_6px,#F7F8F6_6px_12px)]" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {p.brand && <span className="text-[11.5px] text-stem">{p.brand}</span>}
        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-[1.7]">{p.title}</h3>
        {range ? (
          <span className="tabular text-[14.5px] font-extrabold leading-[1.6]">{range} <span className="text-[11.5px] font-medium">تومان</span></span>
        ) : (
          <span className="text-sm text-stem">قیمت ثبت نشده</span>
        )}
        <span className="text-[11.5px] text-stem">قیمت ثبت‌شده، {faNum(p.seller_count)} فروشنده</span>
        <span className="mt-1 self-start"><Unknown size="sm">موجودی نامشخص</Unknown></span>
        <div className="mt-1"><ReasonLine reasons={p.reasons} /></div>
      </div>
    </article>
  );
}
