"use client";
// Compare tray (Search 4b): docked above the bottom nav once something is in compare.
import Link from "next/link";
import { faNum } from "@/lib/format";
import { COMPARE_MAX, useApp } from "@/lib/store";
import { Close } from "./icons";
import { ImageBox, Plus } from "./product-grid-card";

export function CompareTray() {
  const items = useApp((s) => s.compare);
  const remove = useApp((s) => s.removeCompare);
  if (!items.length) return null;
  const ok = items.length >= 2;
  return (
    <div className="flex flex-none items-center gap-2.5 border-t border-line bg-card px-4 py-2.5 shadow-float">
      <div className="flex gap-1.5">
        {items.map((t) => (
          <span key={t.id} className="relative size-11 flex-none rounded-[10px] border border-line">
            <ImageBox src={t.image} className="size-full rounded-[10px] p-0.5" />
            <button type="button" onClick={() => remove(t.id)} aria-label={`حذف ${t.model ?? t.title} از مقایسه`}
              className="hit absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full bg-soil">
              <Close size={9} color="#FFFFFF" sw={4} />
            </button>
          </span>
        ))}
        {items.length < COMPARE_MAX && (
          <span aria-hidden className="flex size-11 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-ash">
            <Plus size={14} color="var(--color-ash)" />
          </span>
        )}
      </div>
      <span className="flex-1 text-[11.5px] leading-normal text-stem">{ok ? `تا ${faNum(COMPARE_MAX)} کالا` : "یک کالای دیگر اضافه کن"}</span>
      {ok ? (
        <Link href={`/compare?ids=${items.map((i) => i.id).join(",")}`}
          className="flex h-[46px] items-center rounded-button bg-radish px-4 text-[14.5px] font-bold whitespace-nowrap text-white">
          مقایسه ({faNum(items.length)})
        </Link>
      ) : (
        <span aria-disabled className="flex h-[46px] items-center rounded-button bg-line px-4 text-[14.5px] font-bold whitespace-nowrap text-stem">
          مقایسه ({faNum(items.length)})
        </span>
      )}
    </div>
  );
}
