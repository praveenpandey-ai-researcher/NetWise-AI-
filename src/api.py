import base64
import json
import traceback
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.pipeline.orchestrator import get_orchestrator, process_query_stream

app = FastAPI(title="Voice AI Backend")

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    enable_tts: bool = True

class ChatResponse(BaseModel):
    response: str
    audio_base64: str | None = None

@app.on_event("startup")
async def startup_event():
    orchestrator = get_orchestrator()
    if not orchestrator.is_initialized:
        await orchestrator.initialize()

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Legacy REST endpoint - Not recommended for low latency"""
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
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for ultra-low latency streaming"""
    await websocket.accept()
    
    try:
        while True:
            # Receive text from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                query = message.get("query")
                
                if query:
                    print(f"[WS] Query received: {query}")
                    try:
                        # Run the streaming orchestrator process
                        await process_query_stream(websocket, query)
                        print(f"[WS] Query completed: {query}")
                    except Exception as e:
                        error_detail = traceback.format_exc()
                        print(f"[WS ERROR] Query failed:\n{error_detail}")
                        # Send error to frontend instead of silently closing
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": str(e)
                            }))
                        except Exception:
                            pass
                    
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket connection error: {e}\n{traceback.format_exc()}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=True)
