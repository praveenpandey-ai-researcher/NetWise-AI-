"""
Voice AI Assistant - Audio Player
Play audio responses with pygame (fixed version)
"""

import asyncio
import tempfile
import time
import os
from pathlib import Path
from typing import Optional

# Initialize pygame with better settings
AUDIO_BACKEND = None

try:
    import pygame
    # Initialize with explicit settings for better compatibility
    pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=512)
    pygame.init()
    pygame.mixer.init()
    pygame.mixer.music.set_volume(1.0)  # Max volume
    AUDIO_BACKEND = "pygame"
    print(f"🔊 Audio initialized: pygame ({pygame.mixer.get_init()})")
except Exception as e:
    print(f"⚠️ pygame init failed: {e}")

if not AUDIO_BACKEND:
    try:
        from pydub import AudioSegment
        from pydub.playback import play as pydub_play
        AUDIO_BACKEND = "pydub"
        print("🔊 Audio initialized: pydub")
    except Exception as e:
        print(f"⚠️ pydub init failed: {e}")


class AudioPlayer:
    """Play audio with auto-detection of available backend"""
    
    def __init__(self):
        self.backend = AUDIO_BACKEND
        self.is_playing = False
        self._temp_files = []
        
        if not self.backend:
            print("⚠️ No audio backend available. Install pygame or pydub")
        else:
            print(f"🔊 Using audio backend: {self.backend}")
    
    def play_bytes(self, audio_bytes: bytes, blocking: bool = True) -> float:
        """
        Play audio from bytes
        
        Args:
            audio_bytes: MP3 audio data
            blocking: Whether to wait for playback to complete
            
        Returns:
            Duration in milliseconds
        """
        if not self.backend:
            print("⚠️ Cannot play audio - no backend available")
            return 0
        
        if len(audio_bytes) < 100:
            print("⚠️ Audio data too small, skipping playback")
            return 0
        
        start_time = time.time()
        
        # Save to temp file
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"voice_ai_{int(time.time())}.mp3")
        
        try:
            with open(temp_path, 'wb') as f:
                f.write(audio_bytes)
            self._temp_files.append(temp_path)
            
            print(f"   🎵 Playing audio ({len(audio_bytes)} bytes)...")
            
            if self.backend == "pygame":
                duration = self._play_pygame(temp_path, blocking)
            elif self.backend == "pydub":
                duration = self._play_pydub(temp_path)
            else:
                duration = 0
            
            return duration
            
        except Exception as e:
            print(f"⚠️ Audio playback error: {e}")
            return 0
        finally:
            # Clean up old temp files
            self._cleanup_temp_files(keep_last=True)
    
    def _play_pygame(self, filepath: str, blocking: bool = True) -> float:
        """Play using pygame with better error handling"""
        start_time = time.time()
        
        try:
            # Make sure pygame is still initialized
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            
            # Set volume to max
            pygame.mixer.music.set_volume(1.0)
            
            # Load and play
            pygame.mixer.music.load(filepath)
            pygame.mixer.music.play()
            self.is_playing = True
            
            if blocking:
                # Wait for playback to complete
                while pygame.mixer.music.get_busy():
                    pygame.time.Clock().tick(10)  # 10 FPS check
                self.is_playing = False
            
            duration = (time.time() - start_time) * 1000
            print(f"   ✅ Audio played ({duration:.0f}ms)")
            return duration
            
        except Exception as e:
            print(f"   ❌ pygame playback error: {e}")
            return 0
    
    def _play_pydub(self, filepath: str) -> float:
        """Play using pydub"""
        start_time = time.time()
        
        try:
            from pydub import AudioSegment
            from pydub.playback import play as pydub_play
            
            audio = AudioSegment.from_mp3(filepath)
            # Increase volume
            audio = audio + 6  # +6 dB
            
            self.is_playing = True
            pydub_play(audio)
            self.is_playing = False
            
            duration = (time.time() - start_time) * 1000
            print(f"   ✅ Audio played ({duration:.0f}ms)")
            return duration
            
        except Exception as e:
            print(f"   ❌ pydub playback error: {e}")
            return 0
    
    async def play_bytes_async(self, audio_bytes: bytes) -> float:
        """Async version of play_bytes"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.play_bytes(audio_bytes, blocking=True)
        )
    
    def stop(self):
        """Stop playback"""
        try:
            if self.backend == "pygame" and pygame.mixer.get_init():
                pygame.mixer.music.stop()
        except:
            pass
        self.is_playing = False
    
    def _cleanup_temp_files(self, keep_last: bool = False):
        """Clean up temporary audio files"""
        files_to_remove = self._temp_files[:-1] if keep_last else self._temp_files
        
        for filepath in files_to_remove:
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
            except:
                pass
        
        if keep_last and self._temp_files:
            self._temp_files = [self._temp_files[-1]]
        else:
            self._temp_files = []
    
    def __del__(self):
        """Cleanup on destruction"""
        self._cleanup_temp_files(keep_last=False)


# Global player instance
_player: Optional[AudioPlayer] = None


def get_audio_player() -> AudioPlayer:
    """Get the global audio player"""
    global _player
    if _player is None:
        _player = AudioPlayer()
    return _player


async def play_audio(audio_bytes: bytes) -> float:
    """Convenience function to play audio"""
    return await get_audio_player().play_bytes_async(audio_bytes)
