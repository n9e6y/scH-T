"use client";
// Home search, docked above the tabs for one-handed use (Bebin Screens 2a). The search icon is the glasses.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Glasses } from "../brand";

// Rotating examples grounded in what the data actually has (downtown electronics bazaar).
export const EXAMPLES = ["گوشی سامسونگ زیر ۶۰ میلیون…", "اسپیکر جی بی ال اقساطی…", "شارژر سامسونگ نزدیک فردوسی…"];

export function SearchDock() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % EXAMPLES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
      className="flex-none border-t border-line bg-flesh px-4 py-2.5">
      <label className="flex h-[54px] items-center gap-3 rounded-button border-[1.5px] border-soil bg-card px-3.5">
        <Glasses width={30} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" aria-label="جست‌وجوی کالا"
          placeholder={EXAMPLES[i]} className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-stem" />
      </label>
    </form>
  );
}
