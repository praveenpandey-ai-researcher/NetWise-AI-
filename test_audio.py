"""Test audio playback"""
import sys
sys.path.insert(0, ".")

print("Testing audio playback...")

# Check pygame
try:
    import pygame
    pygame.mixer.init()
    print(f"✅ pygame initialized: {pygame.mixer.get_init()}")
except Exception as e:
    print(f"❌ pygame failed: {e}")

# Check if we have the audio player backend
from src.voice.audio_player import AUDIO_BACKEND, get_audio_player
print(f"Audio backend: {AUDIO_BACKEND}")

# Test TTS
print("\nTesting TTS generation...")
import asyncio
from src.voice.tts_integration import text_to_speech

async def test():
    try:
        audio_bytes, latency = await text_to_speech("Hello, this is a test.")
        print(f"✅ TTS generated {len(audio_bytes)} bytes in {latency:.0f}ms")
        
        # Save to file for manual testing
        with open("test_audio.mp3", "wb") as f:
            f.write(audio_bytes)
        print("✅ Saved to test_audio.mp3 - try opening it manually")
        
        # Try to play
        print("\nPlaying audio...")
        player = get_audio_player()
        duration = player.play_bytes(audio_bytes, blocking=True)
        print(f"✅ Playback completed in {duration:.0f}ms")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(test())
