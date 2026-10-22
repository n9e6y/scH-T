import asyncio
import json
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app import clock
from app.config import get_settings
from app.db import catalog, meta
from app.models import Area, CategoryGroup, Caveat, Meta

router = APIRouter()

CAVEATS = [
    Caveat(key="stock", text_fa="موجودی کالا در داده‌ها ثبت نمی‌شود؛ باید از فروشنده پرسید."),
    Caveat(key="snapshot", text_fa="قیمت‌ها مربوط به آخرین به‌روزرسانی فروشنده تا تاریخ ۲۱ مهر ۱۴۰۵ است."),
    Caveat(key="coverage", text_fa="این نسخه حدود ۱۰٪ از فروشگاه‌های تهران را پوشش می‌دهد؛ بیشترشان در محدوده‌ی فردوسی، جمهوری و لاله‌زار هستند."),
    Caveat(key="partial_inventory", text_fa="ثبت‌نشدن یک کالا به معنی نداشتن آن نیست."),
    Caveat(key="phones", text_fa="شماره‌ها در نسخه‌ی نمایشی واقعی نیستند؛ پیام‌ها شبیه‌سازی می‌شوند."),
    Caveat(key="payment", text_fa="وضعیت اقساط و ترب‌پی برای بیشتر فروشگاه‌ها ثبت نشده است."),
    Caveat(key="kala_barg", text_fa="پذیرش کالابرگ در داده‌ها ثبت نشده؛ باید از فروشنده پرسید."),
    Caveat(key="floor", text_fa="طبقه و واحد از نشانی استخراج شده و ممکن است دقیق نباشد."),
]


@router.get("/health")
def health():
    catalog().execute("SELECT 1").fetchone()
    return {"ok": True}


@router.get("/health/llm")
async def health_llm():
    s = get_settings()
    if not s.llm_enabled:
        return {"ok": False, "reason": "disabled"}
    if not s.llm_configured:
        return {"ok": False, "reason": "not_configured"}
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(s.llm_base_url.rstrip("/") + "/models",
                                 headers={"Authorization": f"Bearer {s.llm_api_key}"})
        return {"ok": r.status_code < 400, "status": r.status_code, "latency_ms": int((time.perf_counter() - t0) * 1000)}
    except httpx.HTTPError as e:
        return {"ok": False, "reason": type(e).__name__}


@router.get("/_sse_test")
async def sse_test(n: int = 30):
    async def gen():
        for i in range(n):
            yield f"id: {i}\nevent: tick\ndata: {json.dumps({'i': i, 't': time.time()})}\n\n"
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/meta", response_model=Meta)
def get_meta(request: Request):
    s = get_settings()
    m = meta()
    return Meta(snapshot_date=m["snapshot_date"], counts=json.loads(m["counts"]),
                flags={"llm_enabled": s.llm_configured, "embeddings": s.embeddings_provider,
                       "simulator": s.simulator_enabled, "simulator_speed": s.simulator_speed,
                       "demo_director": s.demo_director_enabled},
                caveats=CAVEATS, now=clock.now(request).isoformat())


@router.get("/areas", response_model=list[Area])
def get_areas():
    return [Area(id=r["area_id"], name=r["name_fa"], lat=r["lat"], lng=r["lng"], shop_count=r["shop_count"])
            for r in catalog().execute("SELECT * FROM areas ORDER BY shop_count DESC")]


@router.get("/categories", response_model=list[CategoryGroup])
def get_categories():
    return [CategoryGroup(key=r["key"], label=r["label"], product_count=r["product_count"], shop_count=r["shop_count"])
            for r in catalog().execute("SELECT * FROM category_groups ORDER BY sort")]
