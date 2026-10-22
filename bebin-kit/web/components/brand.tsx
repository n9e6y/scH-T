// Brand marks from the identity board: the glasses symbol, the «ببین» lockup, the torob wordmark, the mascot.
import { mascot, miniRadish, type Pose } from "@/lib/sprites";

/** The glasses: two lenses (r 21, stroke 14) joined by a bridge. App symbol, search icon, loader. */
export function Glasses({ width = 30, color = "var(--color-radish)", blink = false, className = "" }:
  { width?: number; color?: string; blink?: boolean; className?: string }) {
  return (
    <svg width={width} height={(width * 64) / 124} viewBox="0 0 124 64" aria-hidden className={`flex-none ${className}`}>
      <circle cx="28" cy="34" r="21" fill="none" stroke={color} strokeWidth="14" className={blink ? "animate-blink" : ""} />
      <circle cx="96" cy="34" r="21" fill="none" stroke={color} strokeWidth="14"
        className={blink ? "animate-blink [animation-delay:.6s]" : ""} />
      <path d="M55 26 Q62 19 69 26" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/** «ببین» in Lalezar + the glasses symbol. */
export function Lockup({ size = 32, color = "var(--color-soil)", glasses = "var(--color-radish)" }:
  { size?: number; color?: string; glasses?: string }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="ببین">
      <span className="font-display leading-none" style={{ fontSize: size, color, paddingTop: size * 0.19 }}>ببین</span>
      <Glasses width={size * 1.18} color={glasses} />
    </span>
  );
}

/** "torob", lowercase, with the same lenses for its o's. */
export function TorobWordmark({ width = 58, color = "var(--color-ash-line)" }: { width?: number; color?: string }) {
  return (
    <svg width={width} height={(width * 105) / 240} viewBox="-2 4 240 105" aria-label="torob">
      <g fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="30" x2="18" y2="93" /><line x1="8" y1="50" x2="30" y2="50" />
        <circle cx="69" cy="72" r="21" /><path d="M104 93 V72 Q104 52 126 55" />
        <circle cx="143" cy="72" r="21" /><line x1="183" y1="27" x2="183" y2="72" /><circle cx="204" cy="72" r="21" />
      </g>
    </svg>
  );
}

/** The pixel radish. `scale` must be an integer (24px × scale). At most one per screen; never in lists. */
export function Mascot({ pose = "default", scale = 4, className = "" }: { pose?: Pose; scale?: number; className?: string }) {
  const px = 24 * Math.round(scale);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mascot(pose)} width={px} height={px} alt="" aria-hidden className={`pixelated block flex-none ${className}`} />
  );
}

/** Small double-ring stamp with the pixel radish (40 or 24 px). Only for seller-verified facts. */
export function MiniStamp({ size = 40, className = "" }: { size?: 40 | 26 | 24; className?: string }) {
  if (size === 40) {
    return (
      <span className={`flex size-10 flex-none -rotate-[10deg] items-center justify-center rounded-full border-2 border-stamp ${className}`}>
        <span className="flex size-[30px] items-center justify-center rounded-full border border-stamp">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={miniRadish} width={18} height={18} alt="" className="pixelated" />
        </span>
      </span>
    );
  }
  return (
    <span className={`flex flex-none -rotate-[10deg] items-center justify-center rounded-full border-[1.5px] border-stamp ${className}`}
      style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={miniRadish} width={9} height={9} alt="" className="pixelated" />
    </span>
  );
}
