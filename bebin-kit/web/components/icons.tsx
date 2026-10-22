// Line icons drawn on the board (24px grid). Directional ones are mirrored for RTL via `rtl:` where needed.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number; color?: string; sw?: number };
const base = ({ size = 18, color = "currentColor", sw = 2, ...rest }: P) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: sw,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...rest,
});

export const Calendar = (p: P) => <svg {...base({ sw: 2.4, ...p })}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
export const Hourglass = (p: P) => <svg {...base({ sw: 2.4, ...p })}><path d="M7 4h10l-5 8zM12 12l5 8H7z" /></svg>;
export const Moon = (p: P) => <svg {...base({ sw: 2.4, ...p })}><path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" /></svg>;
export const Check = (p: P) => <svg {...base({ sw: 3, ...p })}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Cross = (p: P) => <svg {...base({ sw: 3, ...p })}><path d="M7 7l10 10M17 7 7 17" /></svg>;
export const Close = (p: P) => <svg {...base({ sw: 2.6, ...p })}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Store = (p: P) => <svg {...base({ sw: 2.2, ...p })}><path d="M4 10v10h16V10M3 10l2-6h14l2 6zM10 20v-5h4v5" /></svg>;
export const Info = (p: P) => <svg {...base({ sw: 2.2, ...p })}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></svg>;
export const Pin = (p: P) => <svg {...base({ sw: 2.2, ...p })}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const ChevronDown = (p: P) => <svg {...base({ sw: 2.4, ...p })}><path d="M6 9l6 6 6-6" /></svg>;
export const ChevronUp = (p: P) => <svg {...base({ sw: 2.4, ...p })}><path d="M6 15l6-6 6 6" /></svg>;
/** "Forward" in RTL points left. */
export const ChevronForward = (p: P) => <svg {...base({ sw: 2.2, ...p })}><path d="M15 6l-6 6 6 6" /></svg>;
export const MapIcon = (p: P) => <svg {...base(p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" /></svg>;
export const Target = ({ dot = "currentColor", ...p }: P & { dot?: string }) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill={dot} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
);
export const Lock = (p: P) => <svg {...base({ sw: 2.2, ...p })}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const Blocked = (p: P) => <svg {...base({ sw: 2.2, ...p })}><circle cx="12" cy="12" r="7" /><path d="M4 4l16 16" /></svg>;
export const Route = (p: P) => <svg {...base({ sw: 2.2, ...p })}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" /></svg>;
export const Building = (p: P) => <svg {...base({ sw: 1.7, ...p })}><path d="M4 21V5l8-2v18M12 21V9l8 2v10M3 21h18M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2" /></svg>;
export const Search = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>;

// Bottom nav
export const NavHome = (p: P) => <svg {...base({ sw: 1.9, ...p })}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>;
export const NavAssistant = (p: P) => <svg {...base({ sw: 1.9, ...p })}><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>;
export const NavFollowups = (p: P) => <svg {...base({ sw: 1.9, ...p })}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>;
export const NavPlan = Route;

// Category row (group keys from catalog.category_groups)
function cat(children: React.ReactNode) {
  const CategoryIcon = (p: P) => <svg {...base({ size: 26, sw: 1.7, ...p })}>{children}</svg>;
  return CategoryIcon;
}
export const CATEGORY_ICONS: Record<string, (p: P) => React.ReactElement> = {
  mobile: cat(<><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></>),
  laptop: cat(<><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>),
  audio: cat(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>),
  security: cat(<><path d="M3 8l13-3 2 6-13 3z" /><path d="M7 13l1 4h4M15 9.5l5 1.5" /></>),
  lighting: cat(<><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>),
  electrical: cat(<><path d="M13 2 5 13h6l-1 9 8-11h-6z" /></>),
  watch: cat(<><circle cx="12" cy="12" r="6" /><path d="M9 6.5 9.5 3h5l.5 3.5M9 17.5l.5 3.5h5l.5-3.5M12 9.5V12l1.5 1.5" /></>),
  beauty: cat(<><rect x="8.5" y="12" width="7" height="9.5" rx="1" /><path d="M9.5 12V6.5L14.5 3v9" /></>),
  fashion: cat(<path d="M2.5 17V8.5l4.5 1.5 2 2.5 6 1.5c2.5.6 6.5 1.6 6.5 3V17zM2.5 17h19M9 11.2l1.4-1.1M11.3 12.6l1.4-1.1" />),
  appliances: cat(<><rect x="5" y="2.5" width="14" height="19" rx="2" /><circle cx="12" cy="13" r="4.2" /><path d="M8 6h2" /></>),
  industrial: cat(<><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" /></>),
  car: cat(<><path d="M4 16v-4l2-5h12l2 5v4zM4 16v2M20 16v2M4 12h16" /><circle cx="7.5" cy="14" r=".8" /><circle cx="16.5" cy="14" r=".8" /></>),
  toys: cat(<><circle cx="12" cy="13.5" r="6" /><circle cx="6.5" cy="7" r="2.3" /><circle cx="17.5" cy="7" r="2.3" /><path d="M10.5 15.5c.8.6 2.2.6 3 0" /></>),
  all: cat(<><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>),
};
