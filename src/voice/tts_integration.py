"""
Voice AI Assistant - ElevenLabs TTS Integration
Provides text-to-speech conversion with streaming support
"""

import asyncio
import tempfile
import time
import os
import subprocess
from pathlib import Path
from typing import AsyncGenerator, Tuple

from elevenlabs import ElevenLabs

from src.config import config


def get_elevenlabs_client() -> ElevenLabs:
    """Get a configured ElevenLabs client"""
    return ElevenLabs(api_key=config.elevenlabs.api_key)


async def text_to_speech(
    text: str,
    voice_id: str = None,
    model_id: str = None
) -> Tuple[bytes, float]:
    """
    Convert text to speech and return audio bytes
    
    Returns:
        Tuple of (audio_bytes, latency_ms)
    """
    start_time = time.time()
    
    client = get_elevenlabs_client()
    voice_id = voice_id or config.elevenlabs.voice_id
    model_id = model_id or config.elevenlabs.model
    
    # Run in executor to avoid blocking
    loop = asyncio.get_event_loop()
    
    audio_generator = await loop.run_in_executor(
        None,
        lambda: client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id=model_id,
        )
    )
    
    # Collect audio chunks
    chunks = []
    for chunk in audio_generator:
        chunks.append(chunk)
    
    audio_bytes = b''.join(chunks)
    latency_ms = (time.time() - start_time) * 1000
    
    return audio_bytes, latency_ms


async def stream_text_to_speech(
    text: str,
    voice_id: str = None,
    model_id: str = None
) -> AsyncGenerator[bytes, None]:
    """
    Stream text to speech for lower latency
    
    Yields:
        Audio chunks as they become available
    """
    client = get_elevenlabs_client()
    voice_id = voice_id or config.elevenlabs.voice_id
    model_id = model_id or config.elevenlabs.model
    
    loop = asyncio.get_event_loop()
    
    audio_generator = await loop.run_in_executor(
        None,
        lambda: client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id=model_id,
        )
    )
    
    for chunk in audio_generator:
        yield chunk


async def save_audio_to_file(audio_bytes: bytes, filepath: str | Path) -> None:
    """Save audio bytes to a file"""
    filepath = Path(filepath)
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: filepath.write_bytes(audio_bytes)
    )


async def play_audio(audio_bytes: bytes) -> None:
    """Play audio bytes (saves to temp file and plays with system player)"""
    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name
    
    print(f"🔊 Audio saved to: {temp_path}")
    
    # Try to play using system command
    try:
        if os.name == 'nt':  # Windows
            subprocess.run(['start', '', temp_path], shell=True, check=False)
        elif os.uname().sysname == 'Darwin':  # macOS
            subprocess.run(['afplay', temp_path], check=False)
        else:  # Linux
            subprocess.run(['aplay', temp_path], check=False)
    except Exception as e:
        print(f"Could not auto-play audio: {e}")
        print(f"Audio file saved at: {temp_path}")


async def get_voices() -> list[dict]:
    """Get available voices from ElevenLabs"""
    client = get_elevenlabs_client()
    
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.voices.get_all()
    )
    
    return [
        {
            'voice_id': v.voice_id,
            'name': v.name or 'Unknown',
        }
        for v in response.voices
    ]
