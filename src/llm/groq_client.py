"""
Voice AI Assistant - Groq LLM Client
Provides streaming and non-streaming completions using LangChain
"""

from typing import AsyncGenerator, List, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from src.config import config


def get_llm(
    temperature: float = None,
    max_tokens: int = None,
    streaming: bool = False
) -> ChatGroq:
    """Get a configured Groq LLM instance"""
    return ChatGroq(
        api_key=config.groq.api_key,
        model=config.groq.model,
        temperature=temperature or config.groq.temperature,
        max_tokens=max_tokens or config.groq.max_tokens,
        streaming=streaming,
    )


async def generate_completion(
    messages: List[dict],
    temperature: float = None,
    max_tokens: int = None
) -> str:
    """
    Generate a complete response from Groq
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        temperature: Optional temperature override
        max_tokens: Optional max tokens override
    
    Returns:
        Generated text response
    """
    llm = get_llm(temperature=temperature, max_tokens=max_tokens)
    
    # Convert to LangChain message format
    lc_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        else:
            lc_messages.append(HumanMessage(content=content))
    
    response = await llm.ainvoke(lc_messages)
    return response.content


async def stream_completion(
    messages: List[dict],
    temperature: float = None,
    max_tokens: int = None
) -> AsyncGenerator[str, None]:
    """
    Stream a response from Groq
    
    Yields:
        Text chunks as they are generated
    """
    llm = get_llm(temperature=temperature, max_tokens=max_tokens, streaming=True)
    
    # Convert to LangChain message format
    lc_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        else:
            lc_messages.append(HumanMessage(content=content))
    
    async for chunk in llm.astream(lc_messages):
        if chunk.content:
            yield chunk.content
