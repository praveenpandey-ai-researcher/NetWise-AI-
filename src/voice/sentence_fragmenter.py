"""
Voice AI Assistant - Sentence Fragmenter
Breaks long sentences into shorter, more natural spoken segments
Target: Maximum 15 words per sentence
"""

import re
from typing import List, Tuple

from src.config import config


# Conjunctions and transition phrases that are good break points
BREAK_POINTS = [
    ', and ',
    ', but ',
    ', or ',
    ', so ',
    ', which ',
    ', where ',
    ', when ',
    ', while ',
    ', although ',
    ', because ',
    ', since ',
    ', however ',
    ', therefore ',
    '; ',
    ' – ',
    ' - ',
]

# Phrases that should not be broken
KEEP_TOGETHER = [
    r'step \d+ of \d+',
    r'\d+ to \d+',
    r'for example',
    r'such as',
    r'in order to',
]


def count_words(text: str) -> int:
    """Count words in a text"""
    return len([w for w in text.strip().split() if w])


def find_break_point(sentence: str, max_words: int = None) -> int:
    """Find the best break point in a sentence"""
    max_words = max_words or config.voice.max_words_per_sentence
    
    words = count_words(sentence)
    if words <= max_words:
        return -1
    
    # Try natural break points first
    for break_point in BREAK_POINTS:
        idx = sentence.find(break_point)
        if 0 < idx < len(sentence) - len(break_point):
            before_words = count_words(sentence[:idx])
            after_words = count_words(sentence[idx + len(break_point):])
            
            # Ensure both parts are reasonable sizes
            if 3 <= before_words <= max_words and after_words >= 3:
                return idx + len(break_point) - 1
    
    # Fallback: break at the middle comma
    comma_matches = list(re.finditer(r',\s', sentence))
    if comma_matches:
        middle_idx = len(comma_matches) // 2
        match = comma_matches[middle_idx]
        return match.end()
    
    # Last resort: break at word boundary near middle
    target_pos = int(len(sentence) * 0.6)
    space_after = sentence.find(' ', target_pos)
    if space_after > 0:
        return space_after + 1
    
    return -1


def fragment_sentence(sentence: str, max_words: int = None) -> List[str]:
    """Fragment a single sentence into shorter segments"""
    max_words = max_words or config.voice.max_words_per_sentence
    trimmed = sentence.strip()
    
    if count_words(trimmed) <= max_words:
        return [trimmed] if trimmed else []
    
    # Check if this sentence should be kept together
    for pattern in KEEP_TOGETHER:
        if re.search(pattern, trimmed, re.IGNORECASE):
            return [trimmed]
    
    break_point = find_break_point(trimmed, max_words)
    if break_point == -1:
        return [trimmed]
    
    first_part = trimmed[:break_point].strip()
    second_part = trimmed[break_point:].strip()
    
    # Recursively fragment both parts
    return fragment_sentence(first_part, max_words) + fragment_sentence(second_part, max_words)


def fragment_text(text: str) -> List[str]:
    """Fragment text into voice-optimized sentences"""
    # Split on sentence endings
    sentences = re.split(r'([.!?])\s+', text)
    
    # Reconstruct sentences with punctuation
    reconstructed = []
    i = 0
    while i < len(sentences):
        if i + 1 < len(sentences) and sentences[i + 1] in '.!?':
            reconstructed.append(sentences[i] + sentences[i + 1])
            i += 2
        else:
            if sentences[i].strip():
                reconstructed.append(sentences[i])
            i += 1
    
    result = []
    for sentence in reconstructed:
        sentence = sentence.strip()
        if sentence:
            fragments = fragment_sentence(sentence)
            result.extend(fragments)
    
    return result


def add_pause_markers(sentences: List[str]) -> str:
    """Add natural pause markers for TTS"""
    result = []
    
    for sentence in sentences:
        marked = sentence
        
        # No punctuation at end? Add period
        if not re.search(r'[.!?]$', marked):
            marked += '.'
        
        result.append(marked)
    
    return ' '.join(result)


def fragment_for_voice(text: str) -> Tuple[List[str], str, float]:
    """
    Main fragmentation function
    
    Returns:
        Tuple of (sentences, combined_text, latency_ms)
    """
    import time
    start_time = time.time()
    
    sentences = fragment_text(text)
    combined = add_pause_markers(sentences)
    
    latency_ms = (time.time() - start_time) * 1000
    
    return sentences, combined, latency_ms
