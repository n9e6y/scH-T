// Where a shop is, as one line. View-only formatting of the API's ShopRef.location (no business logic).
import type { S } from "./api";
import { faDigits } from "./format";

type ShopRef = S["ShopRef"];

export function placeLine(shop: ShopRef): string {
  const l = shop.location;
  if (l.mall && l.state === "known") {
    return faDigits([l.mall.name, l.floor_label, l.unit ? `واحد ${l.unit}` : null].filter(Boolean).join("، "));
  }
  if (l.mall) return faDigits(l.mall.name);
  return faDigits(shop.address_short || shop.area || "");
}

/** Navigation deep link. Google Maps opens the native app or the web; Neshan/Balad formats are checked in M6. */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
