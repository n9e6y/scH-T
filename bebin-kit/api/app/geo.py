"""Distance and ETA (ARCHITECTURE §7). Pure."""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

DETOUR = 1.35
SPEED_KMH = {"walk": 4.5, "car": 18.0}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lng2 - lng1) / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(a))


def route_km(lat1, lng1, lat2, lng2) -> float:
    return haversine_m(lat1, lng1, lat2, lng2) * DETOUR / 1000


def eta_min(route: float, travel: str = "walk") -> float:
    return route / SPEED_KMH.get(travel, SPEED_KMH["walk"]) * 60


def bbox(lat: float, lng: float, km: float) -> tuple[float, float, float, float]:
    dlat = km / 111.0
    dlng = km / (111.0 * cos(radians(lat)))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng
