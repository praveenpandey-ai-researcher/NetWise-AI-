"""
Voice AI Assistant - Vocabulary Simplifier
Simplifies technical vocabulary to grade-8 level for natural speech
"""

import re
import time
from typing import List, Tuple

from src.config import config


# Common technical terms and their grade-8 level alternatives
VOCABULARY_MAP = {
    # Technical terms
    'initialize': 'start up',
    'terminate': 'end',
    'execute': 'run',
    'implementation': 'setup',
    'configuration': 'settings',
    'parameters': 'settings',
    'authenticate': 'log in',
    'authorization': 'permission',
    'instantiate': 'create',
    'deprecated': 'outdated',
    'propagate': 'spread',
    'allocate': 'assign',
    'deallocate': 'free up',
    'concatenate': 'join together',
    'enumeration': 'list',
    'subsequent': 'next',
    'preceding': 'previous',
    'utilize': 'use',
    'facilitate': 'help with',
    'functionality': 'features',
    'methodology': 'method',
    'prerequisite': 'requirement',
    'comprehensive': 'complete',
    'modification': 'change',
    'verification': 'check',
    'synchronize': 'sync',
    'asynchronous': 'running in background',
    'concurrent': 'at the same time',
    'repository': 'storage',
    'deployment': 'release',
    'infrastructure': 'system',
    'latency': 'delay',
    'bandwidth': 'data speed',
    'throughput': 'speed',
    'redundancy': 'backup',
    'escalation': 'passing up',
}


def quick_simplify(text: str) -> str:
    """Quick vocabulary simplification using lookup table"""
    result = text
    
    for complex_word, simple_word in VOCABULARY_MAP.items():
        pattern = re.compile(r'\b' + complex_word + r'\b', re.IGNORECASE)
        result = pattern.sub(simple_word, result)
    
    return result


def count_syllables(word: str) -> int:
    """Simple syllable counter"""
    cleaned = re.sub(r'[^a-z]', '', word.lower())
    if len(cleaned) <= 3:
        return 1
    
    vowel_groups = re.findall(r'[aeiouy]+', cleaned)
    count = len(vowel_groups)
    
    # Adjust for silent e
    if cleaned.endswith('e') and count > 1:
        count -= 1
    
    return max(1, count)


def estimate_reading_level(text: str) -> float:
    """
    Estimate reading level using simplified Flesch-Kincaid
    
    Returns:
        Estimated grade level (e.g., 8.0 for grade 8)
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    words = [w for w in text.split() if w]
    
    if not sentences or not words:
        return 0.0
    
    syllables = sum(count_syllables(word) for word in words)
    
    avg_words_per_sentence = len(words) / len(sentences)
    avg_syllables_per_word = syllables / len(words)
    
    # Flesch-Kincaid Grade Level formula
    grade_level = 0.39 * avg_words_per_sentence + 11.8 * avg_syllables_per_word - 15.59
    
    return max(0, round(grade_level, 1))


async def simplify_vocabulary(
    text: str,
    preserve_terms: List[str] = None
) -> Tuple[str, float]:
    """
    LLM-based vocabulary simplification for complex passages
    Targets grade-8 reading level while preserving accuracy
    
    Returns:
        Tuple of (simplified_text, latency_ms)
    """
    from src.llm.groq_client import generate_completion
    
    start_time = time.time()
    
    # If text is short, use quick simplification
    if len(text) < 200:
        return quick_simplify(text), (time.time() - start_time) * 1000
    
    preserve_list = ""
    if preserve_terms:
        preserve_list = f"\nPreserve these technical terms exactly: {', '.join(preserve_terms)}"
    
    system_prompt = f"""You are a text simplifier. Rewrite the given text for a grade 8 reading level (13-14 year old).

Rules:
1. Use simpler words where possible
2. Keep sentences short and clear
3. Maintain technical accuracy - don't remove important information
4. Keep the same meaning and intent{preserve_list}
5. Output ONLY the simplified text, nothing else"""
    
    try:
        simplified = await generate_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            max_tokens=500,
            temperature=0.3
        )
        
        return simplified.strip(), (time.time() - start_time) * 1000
        
    except Exception as e:
        print(f"Vocabulary simplification failed: {e}")
        return quick_simplify(text), (time.time() - start_time) * 1000
