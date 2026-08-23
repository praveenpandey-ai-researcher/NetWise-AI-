import asyncio
import base64
import json
import logging
import traceback
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.config import config, validate_config
from src.pipeline.conversation_state import get_conversation_manager
from src.pipeline.orchestrator import get_orchestrator, process_query_stream

logger = logging.getLogger("netwise.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


class WarmupState:
    """Tracks background index construction so requests can report readiness"""

    def __init__(self):
        self.task: asyncio.Task | None = None
        self.ready: bool = False
        self.error: str | None = None

    @property
    def status(self) -> str:
        if self.ready:
            return "ready"
        if self.error:
            return "failed"
        return "warming_up"


warmup = WarmupState()


async def _build_index() -> None:
    """Load and index the knowledge base off the startup path"""
    orchestrator = get_orchestrator()
    try:
        # Indexing is CPU-bound and blocks the event loop; run it in a worker
        # thread so health checks and WebSocket handshakes stay responsive.
        await asyncio.to_thread(orchestrator.initialize_sync)
        warmup.ready = orchestrator.is_initialized
        if not warmup.ready:
            warmup.error = "No documents were indexed"
        logger.info("Knowledge base warm-up finished: %s", warmup.status)
    except Exception as e:
        warmup.error = str(e)
        logger.error("Knowledge base warm-up failed: %s\n%s", e, traceback.format_exc())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan.

    Uvicorn binds its listening socket only after this startup phase completes,
    so indexing must NOT be awaited here - a ~2 minute blocking build is what
    made Render report "no open ports detected" and fail the deploy. The index
    is built in the background and the port opens immediately.
    """
    for problem in validate_config(require_tts=True):
        logger.warning("Config: %s", problem)

    logger.info(
        "Starting NetWise AI backend (retrieval_mode=%s, port=%s)",
        config.rag.retrieval_mode,
        config.server.port,
    )

    warmup.task = asyncio.create_task(_build_index())

    yield

    if warmup.task and not warmup.task.done():
        warmup.task.cancel()


app = FastAPI(title="Voice AI Backend", lifespan=lifespan)

# Allow CORS for React frontend. Set ALLOWED_ORIGINS to a comma-separated list
# in production; "*" cannot be combined with credentialed requests.
_origins = config.server.allowed_origins
_allow_credentials = _origins != ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str
    enable_tts: bool = True


class ChatResponse(BaseModel):
    response: str
    audio_base64: str | None = None


@app.get("/")
async def root():
    """Render's health check target - answers instantly, even while warming up"""
    return {"service": "NetWise AI", "status": "ok", "index": warmup.status}


@app.get("/health")
async def health():
    """Liveness probe"""
    return {"status": "ok", "index": warmup.status}


@app.get("/api/status")
async def status():
    """Readiness detail, useful for debugging a deploy"""
    return {
        "index": warmup.status,
        "error": warmup.error,
        "retrieval_mode": config.rag.retrieval_mode,
        "model": config.groq.model,
        "groq_key_set": bool(config.groq.api_key),
        "elevenlabs_key_set": bool(config.elevenlabs.api_key),
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Legacy REST endpoint - Not recommended for low latency"""
    if not warmup.ready:
        raise HTTPException(
            status_code=503,
            detail=f"Knowledge base is {warmup.status}. Try again shortly.",
        )

    orchestrator = get_orchestrator()
    try:
        result = await orchestrator.process_query(
            query=request.query,
            enable_tts=request.enable_tts
        )

        audio_b64 = None
        if result.get("audio"):
            audio_b64 = base64.b64encode(result["audio"]).decode("utf-8")

        return ChatResponse(
            response=result.get("response", ""),
            audio_base64=audio_b64
        )
    except Exception as e:
        logger.error("Chat request failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for ultra-low latency streaming"""
    await websocket.accept()

    # One conversation per connection. Previously every client shared the
    # orchestrator's single session id, so one user's history leaked into
    # another user's query rewriting.
    session_id = str(uuid.uuid4())
    logger.info("Client connected (session=%s)", session_id)

    try:
        while True:
            # Receive text from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            query = message.get("query")
            if not query or not str(query).strip():
                continue

            if not warmup.ready:
                detail = warmup.error or "still loading the knowledge base"
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Knowledge base is not ready yet ({detail}). Please retry in a moment.",
                }))
                continue

            logger.info("[WS] Query received (session=%s): %s", session_id, query)
            try:
                # Run the streaming orchestrator process
                await process_query_stream(websocket, query, session_id=session_id)
                logger.info("[WS] Query completed: %s", query)
            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error("[WS ERROR] Query failed:\n%s", traceback.format_exc())
                # Send error to frontend instead of silently closing
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": str(e)
                    }))
                except Exception:
                    pass

    except WebSocketDisconnect:
        logger.info("Client disconnected (session=%s)", session_id)
    except Exception as e:
        logger.error("WebSocket connection error: %s\n%s", e, traceback.format_exc())
    finally:
        # Drop this connection's history so long-lived processes don't grow
        # a conversation entry per client forever.
        get_conversation_manager().delete_conversation(session_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.api:app",
        host=config.server.host,
        port=config.server.port,
        reload=False,
    )
