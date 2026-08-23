"""
Voice AI Assistant - Groq LLM Client
Provides streaming and non-streaming completions using LangChain
"""

from typing import AsyncGenerator, List, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from src.config import config


def get_llm(
    temperature: float = None,
    max_tokens: int = None,
    streaming: bool = False
) -> ChatGroq:
    """Get a configured Groq LLM instance"""
    # `x if x is not None else default` rather than `x or default`: temperature=0
    # is a legitimate value that `or` would silently replace with the default.
    return ChatGroq(
        api_key=config.groq.api_key,
        model=config.groq.model,
        temperature=temperature if temperature is not None else config.groq.temperature,
        max_tokens=max_tokens if max_tokens is not None else config.groq.max_tokens,
        streaming=streaming,
    )


def to_lc_messages(messages: List[dict]) -> list:
    """Convert role/content dicts into LangChain message objects"""
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

    return lc_messages


def message_text(message) -> str:
    """
    Extract plain text from a LangChain message or chunk.

    langchain-core 1.x may deliver `.content` as a list of typed content blocks
    instead of a string. Concatenating that list onto a str raises TypeError, so
    always normalise through here.
    """
    content = getattr(message, "content", message)

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts)

    # Fall back to the convenience accessor exposed by newer langchain-core
    text = getattr(message, "text", None)
    if callable(text):
        text = text()
    return text or ""


async def generate_completion(
    messages: List[dict],
    temperature: float = None,
    max_tokens: int = None,
    use_tools: bool = False
) -> str:
    """
    Generate a complete response from Groq
    
    Args:
        messages: List of message dicts with 'role' and 'content'
        temperature: Optional temperature override
        max_tokens: Optional max tokens override
        use_tools: Whether to bind and execute diagnostic tools
    
    Returns:
        Generated text response
    """
    llm = get_llm(temperature=temperature, max_tokens=max_tokens)
    
    if use_tools:
        from src.tools.diagnostics import get_all_tools
        llm = llm.bind_tools(get_all_tools())
    
    lc_messages = to_lc_messages(messages)

    response = await llm.ainvoke(lc_messages)
    
    if use_tools and hasattr(response, "tool_calls") and response.tool_calls:
        lc_messages.append(response)
        
        from src.tools.diagnostics import get_all_tools
        tool_map = {t.name: t for t in get_all_tools()}
        
        for tool_call in response.tool_calls:
            if tool_call["name"] in tool_map:
                result = tool_map[tool_call["name"]].invoke(tool_call["args"])
                lc_messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))
                
        # Re-invoke LLM with tool results
        response = await llm.ainvoke(lc_messages)

    return message_text(response)


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

    lc_messages = to_lc_messages(messages)

    async for chunk in llm.astream(lc_messages):
        text = message_text(chunk)
        if text:
            yield text
