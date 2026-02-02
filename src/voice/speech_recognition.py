"""
Voice AI Assistant - Speech Recognition (ASR)
Real-time microphone input with speech-to-text
"""

import asyncio
import time
from typing import Optional, Callable

try:
    import speech_recognition as sr
    HAS_SPEECH_RECOGNITION = True
except ImportError:
    HAS_SPEECH_RECOGNITION = False
    print("⚠️ SpeechRecognition not installed. Run: pip install SpeechRecognition PyAudio")


class VoiceInput:
    """Real-time voice input using microphone"""
    
    def __init__(self):
        if not HAS_SPEECH_RECOGNITION:
            raise ImportError("SpeechRecognition required for voice input")
        
        self.recognizer = sr.Recognizer()
        self.microphone = None
        self.is_listening = False
        
        # Adjust for ambient noise
        self.recognizer.energy_threshold = 300
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.pause_threshold = 0.8  # Seconds of silence to end phrase
        
    def _init_microphone(self):
        """Initialize microphone (lazy loading)"""
        if self.microphone is None:
            self.microphone = sr.Microphone()
            # Calibrate for ambient noise
            with self.microphone as source:
                print("🎤 Calibrating microphone for ambient noise...")
                self.recognizer.adjust_for_ambient_noise(source, duration=1)
                print("✅ Microphone ready!")
    
    def listen_once(self, timeout: float = 10) -> tuple[str, float]:
        """
        Listen for a single phrase and return transcription
        
        Returns:
            Tuple of (transcription, latency_ms)
        """
        self._init_microphone()
        start_time = time.time()
        
        print("\n🎤 Listening... (speak now)")
        
        try:
            with self.microphone as source:
                audio = self.recognizer.listen(
                    source,
                    timeout=timeout,
                    phrase_time_limit=15
                )
            
            print("🔄 Processing speech...")
            
            # Use Google's free speech recognition
            text = self.recognizer.recognize_google(audio)
            latency = (time.time() - start_time) * 1000
            
            return text, latency
            
        except sr.WaitTimeoutError:
            return "", 0
        except sr.UnknownValueError:
            print("   Could not understand audio")
            return "", 0
        except sr.RequestError as e:
            print(f"   Speech recognition error: {e}")
            return "", 0
    
    async def listen_once_async(self, timeout: float = 10) -> tuple[str, float]:
        """Async version of listen_once"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self.listen_once(timeout))
    
    def listen_continuous(
        self,
        callback: Callable[[str], None],
        stop_phrase: str = "stop listening"
    ):
        """
        Continuously listen and call callback for each phrase
        
        Args:
            callback: Function to call with each transcription
            stop_phrase: Phrase to stop listening (case insensitive)
        """
        self._init_microphone()
        self.is_listening = True
        
        print("\n🎤 Continuous listening started...")
        print(f"   Say '{stop_phrase}' to stop\n")
        
        while self.is_listening:
            try:
                text, _ = self.listen_once(timeout=10)
                
                if text:
                    if stop_phrase.lower() in text.lower():
                        print("\n🛑 Stop phrase detected")
                        self.is_listening = False
                        break
                    
                    callback(text)
                    
            except KeyboardInterrupt:
                self.is_listening = False
                break
        
        print("🎤 Stopped listening")
    
    def stop(self):
        """Stop continuous listening"""
        self.is_listening = False


def check_microphone() -> bool:
    """Check if microphone is available"""
    if not HAS_SPEECH_RECOGNITION:
        return False
    
    try:
        mic = sr.Microphone()
        with mic as source:
            pass
        return True
    except OSError:
        return False


def list_microphones() -> list[str]:
    """List available microphones"""
    if not HAS_SPEECH_RECOGNITION:
        return []
    
    return sr.Microphone.list_microphone_names()
