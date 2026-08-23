"""
Voice AI Assistant - Configuration Module
Loads environment variables and provides configuration settings
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables
load_dotenv()


class GroqConfig(BaseModel):
    """Groq LLM configuration"""
    api_key: str = os.getenv("GROQ_API_KEY", "")
    # openai/gpt-oss-20b: smallest/fastest model available on this account
    # openai/gpt-oss-120b: slower but higher quality — set GROQ_MODEL in .env to switch
    model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    max_tokens: int = 300  # Voice responses should be short — saves ~1s on generation
    temperature: float = 0.7


class ElevenLabsConfig(BaseModel):
    """ElevenLabs TTS configuration"""
    api_key: str = os.getenv("ELEVENLABS_API_KEY", "")
    voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
    # eleven_flash_v2_5: ~75ms TTFB vs 1.7s for eleven_multilingual_v2
    model: str = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")


class RAGConfig(BaseModel):
    """RAG pipeline configuration"""
    chunk_size: int = int(os.getenv("CHUNK_SIZE", "512"))
    chunk_overlap: int = int(os.getenv("CHUNK_OVERLAP", "50"))
    top_k: int = int(os.getenv("TOP_K", "5"))  # Reduced from 10 -> less context = faster LLM
    rerank_top_k: int = int(os.getenv("RERANK_TOP_K", "3"))
    prefetch_debounce_ms: int = 150
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    # "bm25"   -> lexical only. ~90 MB RSS, no torch. Default: fits Render 512 MB.
    # "hybrid" -> FAISS + BM25 ensemble. ~600 MB RSS, needs requirements-hybrid.txt
    #             and a plan with >= 1 GB RAM.
    retrieval_mode: str = os.getenv("RETRIEVAL_MODE", "bm25").strip().lower()

    # Enable the LLM-based reranker. It costs an extra Groq round trip per query;
    # the heuristic reranker is used when this is off or when the call fails.
    use_llm_rerank: bool = os.getenv("USE_LLM_RERANK", "false").lower() in ("1", "true", "yes")


class VoiceConfig(BaseModel):
    """Voice optimization configuration"""
    max_words_per_sentence: int = int(os.getenv("MAX_WORDS_PER_SENTENCE", "15"))
    target_grade_level: int = int(os.getenv("TARGET_GRADE_LEVEL", "8"))


class LatencyConfig(BaseModel):
    """Latency targets configuration"""
    target_ttfb: int = int(os.getenv("TARGET_TTFB", "800"))
    filler_threshold: int = int(os.getenv("FILLER_THRESHOLD", "500"))


class ConversationConfig(BaseModel):
    """Conversation context configuration"""
    max_history_turns: int = 5


def _parse_origins(raw: str) -> list[str]:
    """Parse a comma-separated CORS origin list"""
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["*"]


class ServerConfig(BaseModel):
    """HTTP server configuration"""
    # Render (and most PaaS) inject the port to listen on via $PORT.
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    # Comma-separated list, e.g. "https://netwise.vercel.app,http://localhost:5173"
    allowed_origins: list[str] = _parse_origins(os.getenv("ALLOWED_ORIGINS", "*"))


class Config(BaseModel):
    """Main configuration container"""
    groq: GroqConfig = GroqConfig()
    elevenlabs: ElevenLabsConfig = ElevenLabsConfig()
    rag: RAGConfig = RAGConfig()
    voice: VoiceConfig = VoiceConfig()
    latency: LatencyConfig = LatencyConfig()
    conversation: ConversationConfig = ConversationConfig()
    server: ServerConfig = ServerConfig()

    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"
    # Pre-built chunk cache. Parsing the PDFs takes ~20 s and peaks near 400 MB,
    # which is far too slow/heavy to do on every cold start. scripts/build_index.py
    # writes this file at build time and startup just loads it.
    index_dir: Path = Path(os.getenv("INDEX_DIR", str(Path(__file__).parent.parent / "data" / "index")))

    @property
    def chunk_cache_path(self) -> Path:
        return self.index_dir / "chunks.json"

    @property
    def faiss_dir(self) -> Path:
        return self.index_dir / "faiss"


# Global config instance
config = Config()


def validate_config(require_tts: bool = True) -> list[str]:
    """Validate required configuration and return list of errors"""
    errors = []

    if not config.groq.api_key:
        errors.append("GROQ_API_KEY is required. Get one at https://console.groq.com")

    if require_tts and not config.elevenlabs.api_key:
        errors.append("ELEVENLABS_API_KEY is required. Get one at https://elevenlabs.io")

    if config.rag.retrieval_mode not in ("bm25", "hybrid"):
        errors.append(
            f"RETRIEVAL_MODE must be 'bm25' or 'hybrid', got {config.rag.retrieval_mode!r}"
        )

    return errors


def print_config_errors(errors: list[str]) -> None:
    """Print configuration errors and exit"""
    if errors:
        print("\n❌ Configuration errors:")
        for error in errors:
            print(f"   - {error}")
        print("\nPlease set these in your .env file")
        exit(1)
