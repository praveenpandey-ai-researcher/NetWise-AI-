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
    model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    max_tokens: int = 1024
    temperature: float = 0.7


class ElevenLabsConfig(BaseModel):
    """ElevenLabs TTS configuration"""
    api_key: str = os.getenv("ELEVENLABS_API_KEY", "")
    voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
    model: str = "eleven_multilingual_v2"


class RAGConfig(BaseModel):
    """RAG pipeline configuration"""
    chunk_size: int = int(os.getenv("CHUNK_SIZE", "512"))
    chunk_overlap: int = int(os.getenv("CHUNK_OVERLAP", "50"))
    top_k: int = int(os.getenv("TOP_K", "10"))
    rerank_top_k: int = int(os.getenv("RERANK_TOP_K", "3"))
    prefetch_debounce_ms: int = 150
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")


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


class Config(BaseModel):
    """Main configuration container"""
    groq: GroqConfig = GroqConfig()
    elevenlabs: ElevenLabsConfig = ElevenLabsConfig()
    rag: RAGConfig = RAGConfig()
    voice: VoiceConfig = VoiceConfig()
    latency: LatencyConfig = LatencyConfig()
    conversation: ConversationConfig = ConversationConfig()
    
    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"


# Global config instance
config = Config()


def validate_config() -> list[str]:
    """Validate required configuration and return list of errors"""
    errors = []
    
    if not config.groq.api_key:
        errors.append("GROQ_API_KEY is required. Get one at https://console.groq.com")
    
    if not config.elevenlabs.api_key:
        errors.append("ELEVENLABS_API_KEY is required. Get one at https://elevenlabs.io")
    
    return errors


def print_config_errors(errors: list[str]) -> None:
    """Print configuration errors and exit"""
    if errors:
        print("\n❌ Configuration errors:")
        for error in errors:
            print(f"   - {error}")
        print("\nPlease set these in your .env file")
        exit(1)
