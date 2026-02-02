"""
Voice AI Assistant - Audio Player
Play audio responses with pygame
"""

import asyncio
import tempfile
import time
import os
from pathlib import Path
from typing import Optional

# Try different audio backends
AUDIO_BACKEND = None

try:
    import pygame
    pygame.mixer.init()
    AUDIO_BACKEND = "pygame"
except:
    pass

if not AUDIO_BACKEND:
    try:
        from pydub import AudioSegment
        from pydub.playback import play as pydub_play
        AUDIO_BACKEND = "pydub"
    except:
        pass


class AudioPlayer:
    """Play audio with auto-detection of available backend"""
    
    def __init__(self):
        self.backend = AUDIO_BACKEND
        self.is_playing = False
        self._temp_files = []
        
        if not self.backend:
            print("⚠️ No audio backend available. Install pygame or pydub")
    
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
        
        start_time = time.time()
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            f.write(audio_bytes)
            temp_path = f.name
            self._temp_files.append(temp_path)
        
        try:
            if self.backend == "pygame":
                return self._play_pygame(temp_path, blocking)
            elif self.backend == "pydub":
                return self._play_pydub(temp_path)
        finally:
            # Clean up old temp files (keep last one in case still playing)
            self._cleanup_temp_files(keep_last=True)
        
        return (time.time() - start_time) * 1000
    
    def _play_pygame(self, filepath: str, blocking: bool = True) -> float:
        """Play using pygame"""
        start_time = time.time()
        
        pygame.mixer.music.load(filepath)
        pygame.mixer.music.play()
        self.is_playing = True
        
        if blocking:
            while pygame.mixer.music.get_busy():
                pygame.time.wait(100)
            self.is_playing = False
        
        return (time.time() - start_time) * 1000
    
    def _play_pydub(self, filepath: str) -> float:
        """Play using pydub"""
        start_time = time.time()
        
        audio = AudioSegment.from_mp3(filepath)
        self.is_playing = True
        pydub_play(audio)
        self.is_playing = False
        
        return (time.time() - start_time) * 1000
    
    async def play_bytes_async(self, audio_bytes: bytes) -> float:
        """Async version of play_bytes"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.play_bytes(audio_bytes, blocking=True)
        )
    
    def stop(self):
        """Stop playback"""
        if self.backend == "pygame" and pygame.mixer.music.get_busy():
            pygame.mixer.music.stop()
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
