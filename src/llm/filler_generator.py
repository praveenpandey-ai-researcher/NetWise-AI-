"""
Voice AI Assistant - Filler Response Generator
Generates conversational filler responses while RAG is processing
"""

import random
from typing import AsyncGenerator

from src.llm.groq_client import generate_completion, stream_completion


STATIC_FILLERS = [
    "Let me look that up for you...",
    "Just a moment while I find that information...",
    "I'm checking on that now...",
    "Give me a second to find the answer...",
    "Let me search through the documentation...",
]


def get_static_filler() -> str:
    """Get a random static filler response"""
    return random.choice(STATIC_FILLERS)


async def generate_filler_response(
    partial_query: str,
    context: dict = None
) -> str:
    """
    Generate a contextual filler response while RAG is processing
    This is spoken immediately to reduce perceived latency
    
    Args:
        partial_query: The user's partial or complete query
        context: Optional conversation context
    
    Returns:
        A short filler response
    """
    # For very short queries, use a simple filler
    if len(partial_query) < 20:
        return get_static_filler()
    
    # Generate a contextual acknowledgment
    system_prompt = """You are a helpful voice assistant. The user is asking a question and you need to briefly acknowledge their query while you look up the answer. 

Keep your response to ONE short sentence (under 10 words). Be natural and conversational.
Do NOT answer the question - just acknowledge you're looking it up.

Examples:
- "Let me check that for you..."
- "I'll look that up right now..."
- "One moment while I find that..."
"""
    
    try:
        response = await generate_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f'User is asking: "{partial_query}"'}
            ],
            max_tokens=30,
            temperature=0.8
        )
        
        return response.strip() or get_static_filler()
        
    except Exception as e:
        print(f"Filler generation failed: {e}")
        return get_static_filler()


async def stream_filler_response(
    partial_query: str,
    context: dict = None
) -> AsyncGenerator[str, None]:
    """
    Stream a filler response for immediate TTS
    
    Yields:
        Text chunks as they are generated
    """
    system_prompt = """You are a helpful voice assistant. Briefly acknowledge the user's query while you look up the answer.
Keep it to ONE short sentence (under 10 words). Be natural and friendly.
Do NOT answer - just acknowledge you're checking."""
    
    async for chunk in stream_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f'User asked: "{partial_query}"'}
        ],
        max_tokens=30,
        temperature=0.8
    ):
        yield chunk
