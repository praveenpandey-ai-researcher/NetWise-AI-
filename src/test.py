"""
Voice AI Assistant - Component Tests (No API Required)
Tests the core logic of query rewriting, search, and voice optimization
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_sentence_fragmentation():
    """Test sentence fragmentation"""
    from src.voice.sentence_fragmenter import fragment_for_voice, count_words
    
    print("📝 Testing Sentence Fragmentation...")
    
    # Test long sentence fragmentation
    long_text = "The router configuration process involves multiple steps including connecting the power adapter, waiting for the LED to turn green, and then accessing the admin panel through your web browser at the default gateway address."
    
    sentences, combined, latency = fragment_for_voice(long_text)
    
    all_short = all(count_words(s) <= 20 for s in sentences)  # Allow some flexibility
    
    if all_short:
        print(f"   ✅ Fragments all under 20 words ({len(sentences)} fragments)")
    else:
        print(f"   ❌ Some fragments too long")
    
    # Test short sentence preservation
    short_text = "Click the save button."
    sentences, _, _ = fragment_for_voice(short_text)
    
    if len(sentences) == 1:
        print("   ✅ Short sentences preserved")
    else:
        print("   ❌ Short sentence incorrectly split")
    
    return all_short


def test_vocabulary_simplification():
    """Test vocabulary simplification"""
    from src.voice.vocabulary_simplifier import quick_simplify, estimate_reading_level
    
    print("\n📝 Testing Vocabulary Simplification...")
    
    # Test word replacement
    complex_text = "Initialize the configuration parameters."
    simplified = quick_simplify(complex_text)
    
    if "start up" in simplified.lower() and "settings" in simplified.lower():
        print("   ✅ Technical terms simplified correctly")
        result1 = True
    else:
        print(f"   ❌ Simplification failed: {simplified}")
        result1 = False
    
    # Test reading level estimation
    simple = "Click the button. Wait for it to load."
    complex_txt = "The asynchronous initialization of infrastructure parameters requires verification."
    
    simple_level = estimate_reading_level(simple)
    complex_level = estimate_reading_level(complex_txt)
    
    if simple_level < complex_level:
        print(f"   ✅ Reading level estimation works (simple: {simple_level}, complex: {complex_level})")
        result2 = True
    else:
        print("   ❌ Reading level estimation incorrect")
        result2 = False
    
    return result1 and result2


def test_phonetic_annotations():
    """Test phonetic annotations"""
    from src.voice.phonetic_annotator import add_phonetic_annotations, get_phonetic
    
    print("\n📝 Testing Phonetic Annotations...")
    
    # Test kubernetes annotation
    text = "Deploy to kubernetes cluster"
    annotated, annotations, _ = add_phonetic_annotations(text)
    
    if "[koo-ber-NET-eez]" in annotated:
        print("   ✅ kubernetes phonetic added correctly")
        result1 = True
    else:
        print(f"   ❌ kubernetes annotation missing: {annotated}")
        result1 = False
    
    # Test multiple terms
    text2 = "Configure nginx on linux with docker"
    annotated2, annotations2, _ = add_phonetic_annotations(text2)
    
    if len(annotations2) == 3:
        print(f"   ✅ Multiple terms annotated ({len(annotations2)} terms)")
        result2 = True
    else:
        print(f"   ❌ Expected 3 annotations, got {len(annotations2)}")
        result2 = False
    
    # Test get_phonetic
    phonetic = get_phonetic("npm")
    if phonetic == "N-P-M":
        print("   ✅ get_phonetic works correctly")
        result3 = True
    else:
        print(f"   ❌ get_phonetic returned: {phonetic}")
        result3 = False
    
    return result1 and result2 and result3


def test_anaphoric_detection():
    """Test anaphoric reference detection"""
    from src.rag.query_rewriter import has_anaphoric_references
    
    print("\n📝 Testing Anaphoric Reference Detection...")
    
    # Test positive cases
    tests = [
        ("How do I restart it?", True),
        ("And what about the second step?", True),
        ("And what should I do next?", True),
        ("How do I reset the router to factory settings?", False),
    ]
    
    all_passed = True
    for query, expected in tests:
        result = has_anaphoric_references(query)
        if result == expected:
            print(f"   ✅ '{query[:40]}...' -> {result}")
        else:
            print(f"   ❌ '{query[:40]}...' expected {expected}, got {result}")
            all_passed = False
    
    return all_passed


def test_query_expansion():
    """Test quick query expansion"""
    from src.rag.query_rewriter import quick_expand_query
    
    print("\n📝 Testing Quick Query Expansion...")
    
    history = [
        {"role": "user", "content": "What are the steps to configure WiFi?"},
        {"role": "assistant", "content": "There are 5 steps..."},
    ]
    
    expanded = quick_expand_query("And the second step?", history)
    
    if "second step" in expanded and "configure WiFi" in expanded:
        print(f"   ✅ Query expanded: {expanded[:60]}...")
        return True
    else:
        print(f"   ❌ Expansion failed: {expanded}")
        return False


def test_end_to_end_voice():
    """Test end-to-end voice optimization"""
    from src.voice.sentence_fragmenter import fragment_for_voice
    from src.voice.vocabulary_simplifier import quick_simplify
    from src.voice.phonetic_annotator import add_phonetic_annotations
    
    print("\n📝 Testing End-to-End Voice Optimization...")
    
    technical_response = "To configure kubernetes deployment, first initialize the kubectl configuration by executing the authentication process. Then modify the yaml parameters for your infrastructure requirements."
    
    # Step 1: Simplify
    simplified = quick_simplify(technical_response)
    
    # Step 2: Fragment
    sentences, _, _ = fragment_for_voice(simplified)
    
    # Step 3: Add phonetics
    annotated, annotations, _ = add_phonetic_annotations(' '.join(sentences))
    
    # Verify results
    has_phonetics = '[' in annotated
    short_sentences = all(len(s.split()) <= 20 for s in sentences)
    
    if has_phonetics and short_sentences:
        print(f"   ✅ Full pipeline works")
        print(f"      - {len(sentences)} fragments")
        print(f"      - {len(annotations)} phonetic annotations")
        return True
    else:
        print("   ❌ Pipeline issues detected")
        return False


def main():
    """Run all tests"""
    print("""
═══════════════════════════════════════════════════════════════
   🧪 Voice AI Assistant - Component Tests (No API Required)
═══════════════════════════════════════════════════════════════
""")
    
    passed = 0
    failed = 0
    
    tests = [
        ("Sentence Fragmentation", test_sentence_fragmentation),
        ("Vocabulary Simplification", test_vocabulary_simplification),
        ("Phonetic Annotations", test_phonetic_annotations),
        ("Anaphoric Detection", test_anaphoric_detection),
        ("Query Expansion", test_query_expansion),
        ("End-to-End Voice", test_end_to_end_voice),
    ]
    
    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"   ❌ {name} crashed: {e}")
            failed += 1
    
    print(f"""
═══════════════════════════════════════════════════════════════
               Test Results: {passed}/{passed + failed} passed
═══════════════════════════════════════════════════════════════
""")
    
    if failed == 0:
        print("🎉 All tests passed! Core components are working.\n")
        print("Next steps:")
        print("1. Install dependencies: pip install -r requirements.txt")
        print("2. Set up your API keys in .env file")
        print("3. Run demo: python src/demo.py")
        print("4. Interactive mode: python src/main.py\n")
    else:
        print(f"⚠️ {failed} test(s) failed. Please check the output above.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
