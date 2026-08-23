"""
Voice AI Assistant - Pipeline Orchestrator
Main orchestrator for parallelized RAG pipeline with LangChain
"""

import asyncio
import base64
import json
import re
import time
import uuid
from typing import Optional, Callable, Any

from langchain_core.documents import Document

from src.config import config
from src.rag.document_loader import load_and_chunk_documents
from src.rag.hybrid_retriever import initialize_retriever, get_retriever
from src.rag.query_rewriter import rewrite_query, quick_expand_query, has_anaphoric_references
from src.rag.reranker import cross_encoder_rerank, heuristic_rerank
from src.llm.groq_client import generate_completion, stream_completion
from src.llm.filler_generator import generate_filler_response, get_static_filler
from src.voice.sentence_fragmenter import fragment_for_voice
from src.voice.vocabulary_simplifier import quick_simplify
from src.voice.phonetic_annotator import add_phonetic_annotations
from src.voice.tts_integration import text_to_speech, save_audio_to_file, play_audio
from src.pipeline.conversation_state import (
    add_user_turn, add_assistant_turn, get_history, get_conversation_manager
)
from src.pipeline.latency_monitor import get_latency_monitor


# Technical networking/diagnostic keywords that signal RAG is needed
RAG_KEYWORDS = [
    "router", "switch", "wifi", "ip", "network", "configure", "config",
    "ospf", "bgp", "vlan", "dns", "dhcp", "ping", "traceroute", "firewall",
    "cisco", "juniper", "netgear", "tp-link", "asus", "aruba",
    "interface", "subnet", "route", "gateway", "ssid", "password",
    "firmware", "reboot", "reset", "port", "cable", "ethernet",
    "troubleshoot", "error", "issue", "problem", "not working", "slow",
    "connection", "speed", "latency", "bandwidth", "how do i", "how to",
    "what is", "explain", "command", "show", "diagnose", "check",
]

SYSTEM_PROMPT = """You are NetWise AI, a voice assistant specialized in enterprise and consumer networking - covering Cisco, NETGEAR, TP-Link, ASUS, Juniper, and Aruba devices.

Your identity (this overrides anything you believe about yourself):
- Your name is NetWise AI.
- You were created by Praveen Pandey and Hiyaa Malik.
- If asked who made you, who your developer is, who created you, who you are, or
  who you were trained by, say you are NetWise AI, built by Praveen Pandey and
  Hiyaa Malik.
- Never say you were made, created, trained, or developed by OpenAI, Google,
  Anthropic, Meta, Microsoft, Groq, or any other company or lab.
- Never mention the underlying language model, its name, or its provider.

Rules:
1. Be conversational and natural - this will be spoken aloud
2. Keep responses concise. Prefer 2-3 sentences for simple questions
3. Use simple language suitable for spoken conversation
4. Do NOT use markdown, lists, or special characters
5. If asked what you can help with, say you specialize in networking: routers, WiFi troubleshooting, Cisco IOS, VLANs, DNS, DHCP, and similar topics
6. If a question is outside networking, politely redirect: say you're specialized in networking and ask if they have a networking question"""

# Abbreviations whose trailing period must not be treated as a sentence end.
_ABBREVIATIONS = r"(?<!\be\.g)(?<!\bi\.e)(?<!\betc)(?<!\bvs)(?<!\bDr)(?<!\bMr)(?<!\bMrs)(?<!\bNo)"
_SENTENCE_END = re.compile(_ABBREVIATIONS + r"[.!?][\)\"’”']?\s+")

# Max concurrent ElevenLabs requests. Synthesis overlaps with token generation,
# but stays bounded so we don't trip the provider's concurrency limit.
_TTS_CONCURRENCY = 2


def split_sentences(buffer: str, min_chars: int = 10) -> tuple[list[str], str]:
    """
    Split a streaming text buffer into complete sentences plus a remainder.

    Returns (complete_sentences, leftover). Only text up to the last sentence
    terminator is emitted; anything after it stays in the buffer, so a partial
    sentence is never handed to TTS and no text is spoken twice.
    """
    sentences = []
    last_end = 0

    for match in _SENTENCE_END.finditer(buffer):
        end = match.end()
        candidate = buffer[last_end:end].strip()
        if len(candidate) >= min_chars:
            sentences.append(candidate)
            last_end = end

    return sentences, buffer[last_end:]


class PipelineOrchestrator:
    """
    Main orchestrator for the zero-latency RAG pipeline

    Features:
    - Parallel execution of search and filler generation
    - Query rewriting with conversation context
    - Hybrid search with cross-encoder reranking
    - Voice-optimized output generation
    """

    def __init__(self):
        self.session_id = str(uuid.uuid4())
        self.is_initialized = False
        self.latency_monitor = get_latency_monitor()

    def initialize_sync(self, data_path: str = None):
        """
        Load and index documents. Blocking and CPU-bound.

        Callers already on an event loop should use `await asyncio.to_thread(...)`
        so the loop stays free to answer health checks while the index builds.
        """
        print("\nInitializing Voice AI Assistant...\n")

        # Load and index documents
        chunks = load_and_chunk_documents(data_path)
        if chunks:
            initialize_retriever(chunks)
            self.is_initialized = True
            print("\nPipeline initialized!\n")
        else:
            print("\nNo documents loaded. Pipeline will have limited functionality.\n")

    async def initialize(self, data_path: str = None):
        """Initialize the pipeline with documents (runs off the event loop)"""
        await asyncio.to_thread(self.initialize_sync, data_path)

    async def process_query(
        self,
        query: str,
        enable_tts: bool = False,
        progress_callback: Optional[Callable[[str, Any], None]] = None,
        session_id: str = None,
    ) -> dict:
        """
        Process a user query through the full RAG pipeline

        Args:
            query: User's question
            enable_tts: Whether to generate TTS audio
            progress_callback: Optional callback for progress updates
            session_id: Conversation session. Defaults to this orchestrator's own.

        Returns:
            Dict with response, audio, and metrics
        """
        session_id = session_id or self.session_id
        run_id = str(uuid.uuid4())
        self.latency_monitor.start_run(run_id)

        def emit(event: str, data: Any = None):
            if progress_callback:
                progress_callback(event, data)

        emit("query_received", {"query": query})

        # Get conversation history for context
        history = get_history(session_id)

        # Step 1: Query rewriting (if needed)
        if has_anaphoric_references(query) and history:
            emit("rewriting_query", None)
            rewritten_query, was_rewritten, rewrite_latency = await rewrite_query(query, history)
            self.latency_monitor.record_latency("query_rewrite", rewrite_latency)

            if was_rewritten:
                emit("query_rewritten", {"original": query, "rewritten": rewritten_query})
                query = rewritten_query
        else:
            rewritten_query = query

        # Step 2: Parallel search + filler generation
        emit("searching", None)

        search_results, filler_response = await asyncio.gather(
            self._run_search(query),
            generate_filler_response(query),
        )

        documents, search_latency = search_results
        self.latency_monitor.record_latency("search", search_latency)

        emit("search_complete", {"num_results": len(documents)})
        emit("filler_ready", {"filler": filler_response})

        # Record first byte (filler is ready to speak)
        self.latency_monitor.record_first_byte()

        # Step 3: Rerank if we have results
        if documents:
            emit("reranking", None)
            reranked, rerank_latency = await cross_encoder_rerank(query, documents)
            self.latency_monitor.record_latency("rerank", rerank_latency)
            emit("rerank_complete", {"num_results": len(reranked)})
        else:
            reranked = []

        # Step 4: Generate response
        emit("generating_response", None)
        llm_start = time.time()

        context = self._format_context(reranked)
        response = await self._generate_response(query, context)

        llm_latency = (time.time() - llm_start) * 1000
        self.latency_monitor.record_latency("llm", llm_latency)

        emit("response_generated", {"response": response[:100] + "..."})

        # Step 5: Voice optimization
        emit("optimizing_voice", None)
        voice_start = time.time()

        optimized_response = await self._optimize_for_voice(response)

        voice_latency = (time.time() - voice_start) * 1000
        self.latency_monitor.record_latency("voice_opt", voice_latency)

        emit("voice_optimized", None)

        # Step 6: TTS (optional)
        audio_bytes = None
        if enable_tts:
            emit("generating_audio", None)
            audio_bytes, tts_latency = await text_to_speech(optimized_response)
            self.latency_monitor.record_latency("tts", tts_latency)
            emit("audio_ready", {"size": len(audio_bytes)})

        # Record conversation
        add_user_turn(session_id, query)
        add_assistant_turn(session_id, response)

        # End metrics
        metrics = self.latency_monitor.end_run(run_id)

        return {
            "query": query,
            "rewritten_query": rewritten_query if rewritten_query != query else None,
            "filler": filler_response,
            "response": response,
            "voice_response": optimized_response,
            "audio": audio_bytes,
            "sources": [doc.metadata for doc in reranked],
            "metrics": {
                "ttfb_ms": metrics.ttfb_ms,
                "total_ms": metrics.total_latency_ms,
            }
        }

    async def _run_search(self, query: str) -> tuple[list[Document], float]:
        """Run hybrid search"""
        retriever = get_retriever()
        if not retriever.is_ready:
            return [], 0

        return await retriever.async_search(query)

    def _format_context(self, documents: list[Document]) -> str:
        """Format retrieved documents as context for LLM"""
        if not documents:
            return "No relevant information found."

        parts = []
        for i, doc in enumerate(documents, 1):
            parts.append(f"[{i}] {doc.page_content}")

        return "\n\n".join(parts)

    async def _generate_response(self, query: str, context: str) -> str:
        """Generate the main response using LLM"""
        system_prompt = """You are NetWise AI, a helpful voice assistant. Answer the user's question using the provided context.

Your identity (this overrides anything you believe about yourself):
- Your name is NetWise AI, created by Praveen Pandey and Hiyaa Malik.
- If asked who made you, who your developer is, or who created you, say you are
  NetWise AI, built by Praveen Pandey and Hiyaa Malik.
- Never say you were made, created, trained, or developed by OpenAI, Google,
  Anthropic, Meta, Microsoft, Groq, or any other company or lab, and never
  mention the underlying language model or its provider.

Rules:
1. Be conversational and natural - this will be spoken aloud
2. Keep your response concise but complete
3. If the context doesn't contain relevant information, say so honestly
4. Use simple language suitable for spoken conversation
5. Don't use markdown formatting, lists, or special characters"""

        user_prompt = f"""Context:
{context}

Question: {query}

Provide a helpful spoken response:"""

        response = await generate_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=500,
            use_tools=True
        )

        return response.strip()

    async def _optimize_for_voice(self, text: str) -> str:
        """Optimize text for voice output"""
        # Step 1: Simplify vocabulary
        simplified = quick_simplify(text)

        # Step 2: Fragment sentences
        sentences, combined, _ = fragment_for_voice(simplified)

        # Step 3: Add phonetic annotations
        annotated, _, _ = add_phonetic_annotations(combined)

        return annotated

    def clear_conversation(self, session_id: str = None):
        """Clear conversation history"""
        get_conversation_manager().clear_history(session_id or self.session_id)
        print("Conversation history cleared")

    async def process_query_stream(self, websocket, query: str, session_id: str = None):
        """
        Process query and stream events/audio over a FastAPI WebSocket

        Args:
            websocket: the client connection
            query: the user's question
            session_id: per-connection conversation key. Callers must pass one;
                without it every connected client shares a single history.
        """
        session_id = session_id or self.session_id

        run_id = str(uuid.uuid4())
        self.latency_monitor.start_run(run_id)

        # Audio is synthesised concurrently, so serialise the actual sends:
        # interleaved send_text calls on one WebSocket corrupt the frame stream.
        send_lock = asyncio.Lock()

        async def send_event(type_str: str, data: dict = None):
            msg = {"type": type_str}
            if data:
                msg.update(data)
            async with send_lock:
                await websocket.send_text(json.dumps(msg))

        async def send_audio(audio_bytes: bytes, is_filler: bool = False):
            if audio_bytes:
                b64 = base64.b64encode(audio_bytes).decode("utf-8")
                async with send_lock:
                    await websocket.send_text(json.dumps({
                        "type": "audio",
                        "data": b64,
                        "is_filler": is_filler
                    }))

        await send_event("query_received", {"query": query})

        # --- Smart Intent Router ---
        lower_query = query.lower().strip()
        needs_rag = any(kw in lower_query for kw in RAG_KEYWORDS)

        search_task = None
        filler_task = None

        try:
            if not needs_rag:
                # No RAG needed - go straight to LLM, no filler
                reranked = []
                context = "Answer the user naturally. No technical documentation lookup is needed."
            else:
                # --- Full RAG Flow with Filler ---
                search_task = asyncio.create_task(self._run_search(query))
                filler_task = asyncio.create_task(generate_filler_response(query))

                # Send filler audio while RAG runs in background
                filler_response = await filler_task
                await send_event("filler_ready", {"filler": filler_response})

                try:
                    filler_audio, _ = await text_to_speech(filler_response)
                    await send_audio(filler_audio, is_filler=True)
                    self.latency_monitor.record_first_byte()
                except Exception as e:
                    print(f"Failed to generate filler TTS: {e}")

                # Wait for search to complete
                documents, search_latency = await search_task
                self.latency_monitor.record_latency("search", search_latency)

                if documents:
                    reranked, rerank_latency = await cross_encoder_rerank(query, documents)
                    self.latency_monitor.record_latency("rerank", rerank_latency)
                else:
                    reranked = []

                context = self._format_context(reranked)

            user_prompt = (
                f"Context:\n{context}\n\nQuestion: {query}\n\n"
                "Provide a helpful spoken response:"
            )

            await send_event("generating_response")

            full_response = await self._stream_response_with_audio(user_prompt, send_audio)

            await send_event("response_generated", {"response": full_response})

            add_user_turn(session_id, query)
            add_assistant_turn(session_id, full_response)
        finally:
            # Never leave an orphaned task behind: an early failure would
            # otherwise surface as "Task exception was never retrieved" noise.
            for task in (search_task, filler_task):
                if task is not None and not task.done():
                    task.cancel()

            self.latency_monitor.end_run(run_id)

    async def _stream_response_with_audio(self, user_prompt: str, send_audio) -> str:
        """
        Stream the LLM response, synthesising each finished sentence as it lands.

        Synthesis runs in its own tasks, so a 1-2s ElevenLabs round trip no longer
        blocks consumption of the token stream. Audio is still sent strictly in
        sentence order.
        """
        llm_start = time.time()
        semaphore = asyncio.Semaphore(_TTS_CONCURRENCY)
        pending: asyncio.Queue = asyncio.Queue()

        async def synthesize(text: str) -> Optional[bytes]:
            async with semaphore:
                try:
                    audio, _ = await text_to_speech(text)
                    return audio
                except Exception as e:
                    print(f"TTS Error: {e}")
                    return None

        async def sender():
            """Await synthesis tasks in submission order and forward the audio"""
            while True:
                task = await pending.get()
                if task is None:
                    return
                try:
                    audio = await task
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"TTS Error: {e}")
                    continue
                if audio:
                    await send_audio(audio, is_filler=False)

        sender_task = asyncio.create_task(sender())
        started: list[asyncio.Task] = []
        first_token_recorded = False
        full_response = ""
        buffer = ""

        try:
            async for chunk in stream_completion([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ]):
                if not first_token_recorded:
                    self.latency_monitor.record_first_byte()
                    first_token_recorded = True

                full_response += chunk
                buffer += chunk

                sentences, buffer = split_sentences(buffer)
                for sentence in sentences:
                    task = asyncio.create_task(synthesize(sentence))
                    started.append(task)
                    await pending.put(task)

            # Send any remaining text to TTS
            if buffer.strip():
                task = asyncio.create_task(synthesize(buffer.strip()))
                started.append(task)
                await pending.put(task)
        finally:
            await pending.put(None)
            try:
                await sender_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"TTS sender failed: {e}")

            for task in started:
                if not task.done():
                    task.cancel()

        self.latency_monitor.record_latency("llm", (time.time() - llm_start) * 1000)
        return full_response


# Global orchestrator instance
_orchestrator: Optional[PipelineOrchestrator] = None


def get_orchestrator() -> PipelineOrchestrator:
    """Get the global orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = PipelineOrchestrator()
    return _orchestrator


async def process_query(query: str, **kwargs) -> dict:
    """Convenience function to process a query"""
    return await get_orchestrator().process_query(query, **kwargs)


async def process_query_stream(websocket, query: str, session_id: str = None):
    """Convenience function to stream a query over websocket"""
    return await get_orchestrator().process_query_stream(websocket, query, session_id=session_id)
