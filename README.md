# NetWise AI

Low-latency voice assistant for networking questions. Streaming RAG pipeline over
vendor manuals (Cisco, NETGEAR, TP-Link, ASUS) with Groq for generation and
ElevenLabs for speech.

- `src/` - FastAPI backend, RAG pipeline, voice post-processing
- `frontend/` - React + Vite UI
- `data/` - source PDF manuals + generated chunk cache
- `scripts/build_index.py` - builds the chunk cache ahead of time

## Local development

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt

cp .env.example .env            # then fill in GROQ_API_KEY and ELEVENLABS_API_KEY

python -m scripts.build_index   # parse the PDFs once (~10s)
uvicorn src.api:app --reload --port 8000
```

Check it came up:

```bash
curl http://localhost:8000/api/status
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI connects to `ws://localhost:8000/ws/chat` automatically when served from
localhost. To point it elsewhere, set `VITE_WS_URL`:

```bash
# frontend/.env
VITE_WS_URL=wss://your-service.onrender.com/ws/chat
```

## Retrieval modes

`RETRIEVAL_MODE` selects how documents are searched:

| Mode | Backends | RSS | Boot | Requirements |
|---|---|---|---|---|
| `bm25` (default) | BM25 only | ~110 MB | <1s | `requirements.txt` |
| `hybrid` | FAISS + BM25 | ~600 MB | ~5s (prebuilt index) | `+ requirements-hybrid.txt`, >=1 GB RAM |

`bm25` is the default because it fits Render's 512 MB free and starter plans.
To enable dense retrieval on a larger plan:

```bash
pip install -r requirements.txt -r requirements-hybrid.txt
python -m scripts.build_index --faiss
RETRIEVAL_MODE=hybrid uvicorn src.api:app
```

## Deploying the backend to Render

The repo includes `render.yaml`, so Render can provision the service from a
blueprint.

1. **Create the service** — Render Dashboard → **New** → **Blueprint** → select
   this repository. Render reads `render.yaml`.
   (For an existing service, point it at this repo/branch instead; the settings
   below match what the blueprint would apply.)

2. **Set the two secrets** when prompted, or under **Environment**:
   - `GROQ_API_KEY` — https://console.groq.com
   - `ELEVENLABS_API_KEY` — https://elevenlabs.io

   These are `sync: false` in the blueprint, so they are never stored in git.
   The service starts without them but every query returns an error.

3. **Deploy.** The build step parses the PDFs and writes the chunk cache; the
   start command binds `$PORT` immediately.

Settings the blueprint applies:

| Setting | Value |
|---|---|
| Build command | `pip install -r requirements.txt && python -m scripts.build_index` |
| Start command | `uvicorn src.api:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |
| `RETRIEVAL_MODE` | `bm25` |

4. **Verify:**

```bash
curl https://<service>.onrender.com/api/status
# {"index":"ready","retrieval_mode":"bm25","groq_key_set":true,...}
```

`index` must read `ready`. `warming_up` means the knowledge base is still
loading; `failed` puts the reason in `error`.

5. **Point the frontend at it** by setting `VITE_WS_URL` in the frontend host's
   build environment (or leave it unset to use the default in `ChatPage.jsx`).

### Notes

- Free instances sleep after 15 minutes idle and take ~30-60s to wake. The UI
  reconnects on its own, so the first question after a sleep may need a retry.
- Do not raise `RETRIEVAL_MODE` to `hybrid` on a 512 MB plan — it will OOM.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness. Answers instantly, even while warming up. |
| `GET /api/status` | Index state, retrieval mode, whether API keys are set. |
| `POST /api/chat` | Non-streaming request/response. Higher latency. |
| `WS /ws/chat` | Streaming events + sentence-by-sentence audio. Used by the UI. |

Send `{"query": "..."}` over the WebSocket. Messages come back as
`query_received`, `filler_ready`, `generating_response`, `audio` (base64 MP3),
`response_generated`, and `error`.
