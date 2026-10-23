import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.inquiries import engine
from app.routers import assistant, catalog, inquiries, meta


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Start the inquiry scheduler and re-queue whatever was pending before a restart."""
    engine.hub.loop = asyncio.get_running_loop()
    engine.rehydrate()
    task = asyncio.create_task(engine.scheduler.run())
    yield
    task.cancel()


app = FastAPI(title="Bebin API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message_fa": "مشکلی پیش آمد."}
    return JSONResponse(detail, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse({"code": "invalid_request", "message_fa": "درخواست نامعتبر است."}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse({"code": "internal", "message_fa": "مشکلی پیش آمد؛ دوباره امتحان کن."}, status_code=500)


app.include_router(meta.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(inquiries.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
