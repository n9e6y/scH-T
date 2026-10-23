"""Assistant chat over SSE (PRODUCT_SPEC F13)."""
from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import clock, llm
from app.assistant.agent import run
from app.models import AssistantSchema, ChatIn

router = APIRouter()


@router.post("/assistant/chat")
async def chat(request: Request, body: ChatIn, x_session_id: Annotated[str | None, Header()] = None):
    if not x_session_id:
        raise HTTPException(400, {"code": "no_session", "message_fa": "نشست مشخص نیست."})
    at = clock.now(request)

    async def gen():
        async for ev in run(body, at, x_session_id):
            yield f"event: {ev['type']}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/assistant/status")
def status():
    return {"llm": llm.available()}


@router.get("/assistant/_schema", response_model=AssistantSchema, include_in_schema=True)
def schema():
    """Documents the block types streamed by /assistant/chat (for `make types`)."""
    raise HTTPException(404, {"code": "not_found", "message_fa": "—"})
