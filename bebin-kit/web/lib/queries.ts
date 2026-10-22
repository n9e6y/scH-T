"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Area, type CategoryGroup, type MallNear, type Meta } from "./api";
import { useApp } from "./store";

export const useAreas = () => useQuery({ queryKey: ["areas"], queryFn: () => api<Area[]>("/areas"), staleTime: Infinity });
export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api<CategoryGroup[]>("/categories"), staleTime: Infinity });
export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta"), staleTime: 60_000 });

export function useMallsNear() {
  const loc = useApp((s) => s.location);
  return useQuery({
    queryKey: ["malls-near", loc?.lat, loc?.lng],
    queryFn: () => api<MallNear[]>("/malls/near", { lat: loc!.lat, lng: loc!.lng, limit: 6 }),
    enabled: !!loc,
    staleTime: 60_000,
  });
}

/** Distance in metres; used only to name a GPS/map point after the nearest preset. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
