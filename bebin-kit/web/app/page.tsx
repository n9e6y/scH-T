"use client";
// F2 Home (Bebin Screens 2a returning, 2b first time).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav, TopBar } from "@/components/chrome";
import { AroundYou, AssistantEntry, CategoryRow, ContinueSection, FirstTime } from "@/components/home/sections";
import { SearchDock } from "@/components/home/search-dock";
import { LocationSheet } from "@/components/location";
import { useApp } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const onboarded = useApp((s) => s.onboarded);
  const last = useApp((s) => s.lastViewed);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!onboarded) router.replace("/onboarding");
  }, [onboarded, router]);
  if (!onboarded) return null;

  const returning = !!last; // inquiries join this in M4
  return (
    <div className="flex h-dvh flex-col">
      <TopBar onLocation={() => setSheet(true)} locationOpen={sheet} />
      <main className="no-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pt-2 pb-7">
        <CategoryRow />
        <AssistantEntry mascotAvatar={returning} />
        {returning ? <ContinueSection last={last} /> : (
          <FirstTime onExample={() => router.push(`/search?q=${encodeURIComponent("گوشی سامسونگ زیر ۶۰ میلیون اقساطی")}`)} />
        )}
        <AroundYou onSetLocation={() => setSheet(true)} />
      </main>
      <SearchDock />
      <BottomNav />
      <LocationSheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}
