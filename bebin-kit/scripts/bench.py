"""p50/p95 latency for the demo scenarios against the in-process API (ARCHITECTURE §12 targets)."""
from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

LOC = {"lat": 35.6921, "lng": 51.4225}
QUERIES = ["گوشی شیائومی", "اسپیکر جی بی ال زیر ۱۰۰ میلیون", "شارژر سامسونگ اقساطی", "لپ تاپ", "هدفون بی سیم",
           "ساعت هوشمند", "کفش رانینگ", "دوربین مدار بسته", "گوشی سامسونگ نزدیک فردوسی", "پاوربانک"]
PRODUCTS = ["product_5ed27d0acc3f28d667f5abef", "product_1ed06d38ae22d1bfbe707f87", "product_00b6314bfbc1f0e9bde61774",
            "product_adfdc73bc839d15cd7754318"]


def run(label, calls, target):
    c = TestClient(app)
    c.get("/api/health")
    times = []
    for _ in range(3):
        for url, params in calls:
            t = time.perf_counter()
            assert c.get(url, params=params).status_code == 200, url
            times.append((time.perf_counter() - t) * 1000)
    times.sort()
    p50, p95 = statistics.median(times), times[int(len(times) * 0.95) - 1]
    print(f"{label:8} n={len(times):3} p50={p50:6.0f} ms  p95={p95:6.0f} ms  target p95<{target} ms  "
          f"{'OK' if p95 < target else 'SLOW'}")


if __name__ == "__main__":
    run("search", [("/api/search", {"q": q, **LOC}) for q in QUERIES], 300)
    run("sellers", [(f"/api/products/{p}/sellers", {**LOC, "mode": m}) for p in PRODUCTS
                    for m in ("balanced", "cheapest", "nearest")], 200)
