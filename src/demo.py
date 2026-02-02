"""
Voice AI Assistant - Demo Script
Demonstrates the zero-latency RAG pipeline with sample queries
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import validate_config, print_config_errors
from src.pipeline.orchestrator import get_orchestrator


DEMO_QUERIES = [
    "How do I reset my router to factory settings?",
    "And what should I do after that?",  # Follow-up with anaphoric reference
    "Why is my internet connection slow?",
    "What about the second step you mentioned?",  # Anaphoric reference
    "How do I update the router firmware?",
]


async def main():
    """Run the demo"""
    print("""
═══════════════════════════════════════════════════════════════
       🎤 Voice AI Assistant - Zero Latency RAG Demo
       Python + LangChain Implementation
═══════════════════════════════════════════════════════════════
""")
    
    # Validate configuration
    print("📦 Checking configuration...")
    errors = validate_config()
    if errors:
        print_config_errors(errors)
        return
    
    print("✅ Configuration valid\n")
    
    # Initialize the orchestrator
    print("📦 Initializing pipeline...")
    orchestrator = get_orchestrator()
    await orchestrator.initialize()
    
    def progress_callback(event: str, data):
        """Callback for progress updates"""
        emoji = {
            "query_received": "📩",
            "rewriting_query": "📝",
            "query_rewritten": "✏️",
            "searching": "🔍",
            "search_complete": "📚",
            "filler_ready": "💬",
            "reranking": "📊",
            "rerank_complete": "✅",
            "generating_response": "🤖",
            "response_generated": "✨",
            "optimizing_voice": "🔊",
            "voice_optimized": "🎙️",
        }.get(event, "•")
        
        if event == "query_rewritten":
            print(f"   {emoji} Rewritten: {data['rewritten']}")
        elif event == "filler_ready":
            print(f"   {emoji} Filler: \"{data['filler']}\"")
        elif event == "search_complete":
            print(f"   {emoji} Found {data['num_results']} relevant chunks")
        else:
            print(f"   {emoji} {event.replace('_', ' ').title()}")
    
    # Run through demo queries
    print("\n" + "─" * 60)
    print("Running demo queries...")
    print("─" * 60 + "\n")
    
    for i, query in enumerate(DEMO_QUERIES, 1):
        print(f"\n{'═' * 60}")
        print(f"  Demo Query {i}/{len(DEMO_QUERIES)}")
        print(f"{'═' * 60}")
        print(f"\n🎤 User: {query}\n")
        
        try:
            result = await orchestrator.process_query(
                query,
                enable_tts=False,  # Skip TTS in demo for speed
                progress_callback=progress_callback
            )
            
            print(f"\n🤖 Response:\n{result['response']}")
            
            if result.get('rewritten_query'):
                print(f"\n   ℹ️ Query was rewritten from: {query}")
            
            print(f"\n   ⏱️ TTFB: {result['metrics']['ttfb_ms']:.0f}ms | Total: {result['metrics']['total_ms']:.0f}ms")
            
        except Exception as e:
            print(f"\n❌ Error processing query: {e}")
            import traceback
            traceback.print_exc()
        
        # Brief pause between queries
        if i < len(DEMO_QUERIES):
            await asyncio.sleep(1)
    
    print(f"\n{'═' * 60}")
    print("  Demo Complete!")
    print(f"{'═' * 60}\n")
    
    print("To run interactively: python -m src.main")
    print("To test without APIs: python src/test.py\n")


if __name__ == "__main__":
    asyncio.run(main())
