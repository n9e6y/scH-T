// Typed API client. Types come from FastAPI's OpenAPI (`make types` → api-types.ts); never hand-write them.
import type { components } from "./api-types";
import { getSessionId, useApp } from "./store";

export type S = components["schemas"];
export type Area = S["Area"];
export type CategoryGroup = S["CategoryGroup"];
export type MallNear = S["MallNear"];
export type Meta = S["Meta"];
export type SearchOut = S["SearchOut"];
export type ProductCard = S["ProductCard"];
export type ProductDetail = S["ProductDetail"];
export type SellerRow = S["SellerRow"];
export type Price = S["Price"];
export type Stock = S["Stock"];
export type OpenStatus = S["OpenStatus"];
export type Payment = S["Payment"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

function qs(params?: Query): string {
  if (!params) return "";
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || v === false) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, params?: Query, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "X-Session-Id": getSessionId() };
  const clock = useApp.getState().demoClock;
  if (clock) headers["X-Demo-Clock"] = clock;
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}/api${path}${qs(params)}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) {
    let body: { code?: string; message_fa?: string } = {};
    try { body = await res.json(); } catch {}
    throw new ApiError(res.status, body.code ?? "error", body.message_fa ?? "مشکلی پیش آمد.");
  }
  return res.json() as Promise<T>;
}
