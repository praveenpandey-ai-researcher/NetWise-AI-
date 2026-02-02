"""
Voice AI Assistant - Full Duplex Voice Mode
Real-time voice conversation with microphone input and speaker output
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import config, validate_config, print_config_errors
from src.pipeline.orchestrator import get_orchestrator
from src.voice.tts_integration import text_to_speech
from src.voice.audio_player import get_audio_player, play_audio

# Try to import speech recognition
try:
    from src.voice.speech_recognition import VoiceInput, check_microphone
    HAS_VOICE_INPUT = True
except ImportError:
    HAS_VOICE_INPUT = False


def print_banner():
    """Print welcome banner"""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║       🎤 Voice AI Assistant - Full Duplex Voice Mode          ║
║           Speak naturally, get spoken responses!              ║
╚═══════════════════════════════════════════════════════════════╝
""")


async def speak_text(text: str, player) -> None:
    """Convert text to speech and play it"""
    try:
        audio_bytes, tts_latency = await text_to_speech(text)
        print(f"   🔊 Speaking... ({len(audio_bytes)} bytes)")
        await player.play_bytes_async(audio_bytes)
    except Exception as e:
        print(f"   ⚠️ TTS error: {e}")
        print(f"   📝 Response: {text}")


async def voice_conversation():
    """Main voice conversation loop"""
    print_banner()
    
    # Check requirements
    if not HAS_VOICE_INPUT:
        print("❌ Voice input not available. Install dependencies:")
        print("   pip install SpeechRecognition PyAudio")
        return
    
    if not check_microphone():
        print("❌ No microphone detected. Please connect a microphone.")
        return
    
    # Validate configuration
    errors = validate_config()
    if errors:
        print_config_errors(errors)
        return
    
    # Initialize components
    print("📦 Initializing...")
    
    orchestrator = get_orchestrator()
    await orchestrator.initialize()
    
    voice_input = VoiceInput()
    audio_player = get_audio_player()
    
    print("\n✅ Voice AI ready!")
    print("─" * 50)
    print("🎤 Just speak naturally - I'll listen and respond")
    print("📢 Say 'goodbye' or 'exit' to quit")
    print("─" * 50)
    
    # Speak a greeting
    await speak_text("Hello! I'm your voice assistant. How can I help you today?", audio_player)
    
    # Main conversation loop
    while True:
        try:
            # Listen for user input
            text, asr_latency = await voice_input.listen_once_async(timeout=15)
            
            if not text:
                continue
            
            print(f"\n🎤 You said: \"{text}\"")
            print(f"   (ASR: {asr_latency:.0f}ms)")
            
            # Check for exit commands
            lower_text = text.lower()
            if any(cmd in lower_text for cmd in ['goodbye', 'exit', 'quit', 'stop', 'bye']):
                await speak_text("Goodbye! Have a great day!", audio_player)
                break
            
            # Process through RAG pipeline
            print("\n🔄 Processing...")
            
            result = await orchestrator.process_query(
                text,
                enable_tts=False  # We'll handle TTS ourselves
            )
            
            response = result.get('voice_response') or result.get('response', '')
            
            print(f"\n🤖 Response: {response[:100]}...")
            print(f"   ⏱️ TTFB: {result['metrics']['ttfb_ms']:.0f}ms | Total: {result['metrics']['total_ms']:.0f}ms")
            
            # Speak the response
            await speak_text(response, audio_player)
            
        except KeyboardInterrupt:
            print("\n\n👋 Interrupted!")
            await speak_text("Goodbye!", audio_player)
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n👋 Voice session ended")


async def main():
    """Entry point"""
    await voice_conversation()


if __name__ == "__main__":
    asyncio.run(main())
