import Link from "next/link";
import type { Pose } from "@/lib/sprites";
import { Mascot } from "./brand";

/** Lalezar headline + one line + one primary action (DESIGN_SYSTEM §6). The screen's one mascot. */
export function EmptyState({ pose = "default", title, body, action }:
  { pose?: Pose; title: string; body: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center-safe gap-3 px-8 py-6 text-center">
      <Mascot pose={pose} scale={4} />
      <h1 className="font-display text-[26px] leading-[1.35]">{title}</h1>
      <p className="text-[13.5px] leading-[1.85] text-stem">{body}</p>
      {action && (
        <Link href={action.href} className="mt-2 flex h-12 items-center rounded-button bg-radish px-6 text-[15px] font-bold text-white">
          {action.label}
        </Link>
      )}
    </div>
  );
}
