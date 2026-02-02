"""
Voice AI Assistant - Query Rewriter
Resolves anaphoric references using conversation history with LangChain
"""

import re
from typing import Optional, Tuple

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from src.config import config


# Patterns that indicate anaphoric references needing resolution
ANAPHORIC_PATTERNS = [
    r'\b(it|this|that|these|those)\b',
    r'\b(the (?:first|second|third|fourth|fifth|last|next|previous) (?:one|step|item|option|thing))\b',
    r'\b(what about|how about|and the|also the)\b',
    r'\b(same|another|other|more)\b',
    r'^(and |also |but |or |what about )',
]


def has_anaphoric_references(query: str) -> bool:
    """Check if a query contains anaphoric references that need resolution"""
    query_lower = query.lower()
    
    for pattern in ANAPHORIC_PATTERNS:
        if re.search(pattern, query_lower, re.IGNORECASE):
            return True
    
    return False


def format_history(history: list[dict]) -> str:
    """Format conversation history for the LLM"""
    formatted = []
    for turn in history[-5:]:  # Last 5 turns
        role = turn.get("role", "user").upper()
        content = turn.get("content", "")
        formatted.append(f"{role}: {content}")
    
    return "\n".join(formatted)


def quick_expand_query(query: str, history: list[dict]) -> str:
    """
    Quick heuristic-based query expansion (no LLM call)
    Used for pre-fetch when speed is critical
    """
    if not history:
        return query
    
    # Get the last user query for context
    last_user_turn = None
    for turn in reversed(history):
        if turn.get("role") == "user":
            last_user_turn = turn.get("content", "")
            break
    
    if not last_user_turn:
        return query
    
    expanded = query
    
    # Handle ordinal references
    ordinal_match = re.search(
        r'\b(first|second|third|fourth|fifth|last)\s+(one|step|item|option|thing)\b',
        query,
        re.IGNORECASE
    )
    if ordinal_match:
        expanded = f'{ordinal_match.group(0)} from "{last_user_turn}"'
    
    # Handle queries starting with conjunctions
    if re.match(r'^(and|also|but|or)\s+', query, re.IGNORECASE):
        expanded = f'In the context of "{last_user_turn}", {query}'
    
    return expanded


async def rewrite_query(
    query: str,
    history: list[dict],
    llm: Optional[ChatGroq] = None
) -> Tuple[str, bool, float]:
    """
    Rewrite a query to resolve anaphoric references using conversation context
    
    Returns:
        Tuple of (rewritten_query, was_rewritten, latency_ms)
    """
    import time
    start_time = time.time()
    
    # If no history or no anaphoric references, return original
    if not history or not has_anaphoric_references(query):
        return query, False, (time.time() - start_time) * 1000
    
    # Initialize LLM if not provided
    if llm is None:
        llm = ChatGroq(
            api_key=config.groq.api_key,
            model=config.groq.model,
            temperature=0.3,
            max_tokens=150,
        )
    
    # Create the rewriting prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a query rewriter. Your task is to resolve ambiguous references in a user's follow-up question by using the conversation history.

Rules:
1. If the query has pronouns like "it", "that", "this", replace them with what they refer to
2. If the query mentions "the second one", "the first step", etc., resolve what that refers to
3. If the query is incomplete (starts with "and", "also", "what about"), complete it
4. Keep the rewritten query natural and conversational
5. If no rewriting is needed, return the original query exactly
6. Output ONLY the rewritten query, nothing else

Conversation history:
{history}"""),
        ("user", "{query}")
    ])
    
    chain = prompt | llm | StrOutputParser()
    
    try:
        rewritten = await chain.ainvoke({
            "history": format_history(history),
            "query": query
        })
        
        rewritten = rewritten.strip()
        was_rewritten = rewritten.lower() != query.lower()
        
        return rewritten or query, was_rewritten, (time.time() - start_time) * 1000
        
    except Exception as e:
        print(f"Query rewriting failed: {e}")
        return query, False, (time.time() - start_time) * 1000
