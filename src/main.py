"""
Voice AI Assistant - Main Entry Point
Interactive REPL for testing the voice AI pipeline with TTS support
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import config, validate_config, print_config_errors
from src.pipeline.orchestrator import get_orchestrator


def print_banner():
    """Print welcome banner"""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           🎤 Voice AI Assistant - Python + LangChain          ║
║               Zero-Latency RAG Pipeline Demo                  ║
╚═══════════════════════════════════════════════════════════════╝
""")


def print_help():
    """Print help message"""
    print("""
Commands:
  /clear   - Clear conversation history
  /quit    - Exit the program
  /help    - Show this help message
  /tts     - Toggle TTS (currently off)
  
Just type your question and press Enter!
""")


async def main():
    """Main entry point"""
    print_banner()
    
    # Validate configuration
    errors = validate_config()
    if errors:
        print_config_errors(errors)
        return
    
    # Initialize the orchestrator
    orchestrator = get_orchestrator()
    await orchestrator.initialize()
    
    print_help()
    
    enable_tts = False
    
    def progress_callback(event: str, data):
        if event == "rewriting_query":
            print("   📝 Rewriting query...")
        elif event == "query_rewritten":
            print(f"   📝 Rewritten: {data['rewritten']}")
        elif event == "searching":
            print("   🔍 Searching...")
        elif event == "search_complete":
            print(f"   🔍 Found {data['num_results']} results")
        elif event == "filler_ready":
            print(f"   💬 Filler: \"{data['filler']}\"")
        elif event == "reranking":
            print("   📊 Reranking...")
        elif event == "generating_response":
            print("   🤖 Generating response...")
        elif event == "optimizing_voice":
            print("   🔊 Optimizing for voice...")
        elif event == "generating_audio":
            print("   🎵 Generating audio...")
    
    while True:
        try:
            user_input = input("\n🎤 You: ").strip()
            
            if not user_input:
                continue
            
            # Handle commands
            if user_input.startswith('/'):
                cmd = user_input.lower()
                if cmd == '/quit' or cmd == '/exit':
                    print("\n👋 Goodbye!")
                    break
                elif cmd == '/clear':
                    orchestrator.clear_conversation()
                    continue
                elif cmd == '/help':
                    print_help()
                    continue
                elif cmd == '/tts':
                    enable_tts = not enable_tts
                    status = "enabled" if enable_tts else "disabled"
                    print(f"   🔊 TTS {status}")
                    continue
                else:
                    print(f"   Unknown command: {cmd}")
                    continue
            
            # Process query
            print()
            result = await orchestrator.process_query(
                user_input,
                enable_tts=enable_tts,
                progress_callback=progress_callback
            )
            
            print(f"\n🤖 Assistant: {result['response']}")
            
            if result.get('voice_response') and result['voice_response'] != result['response']:
                print(f"\n   (Voice optimized: {result['voice_response'][:100]}...)")
            
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
