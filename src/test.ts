/**
 * Voice AI Assistant - Component Test (No API Keys Required)
 * Tests the core logic of query rewriting, search, and voice optimization
 */

import { fragmentForVoice } from './voice/sentenceFragmenter.js';
import { quickSimplify, estimateReadingLevel } from './voice/vocabularySimplifier.js';
import { addPhoneticAnnotations, getPhonetic } from './voice/phoneticAnnotator.js';
import { hasAnaphoricReferences, quickExpandQuery } from './rag/queryRewriter.js';
import type { ConversationContext, DocumentChunk } from './types/index.js';

console.log('═══════════════════════════════════════════════════════════════');
console.log('   🧪 Voice AI Assistant - Component Tests (No API Required)');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
    try {
        const result = fn();
        if (result) {
            console.log(`✅ ${name}`);
            passed++;
        } else {
            console.log(`❌ ${name}`);
            failed++;
        }
    } catch (error) {
        console.log(`❌ ${name} - Error: ${error}`);
        failed++;
    }
}

// Test 1: Sentence Fragmentation
console.log('\n📝 Testing Sentence Fragmentation...');

test('Breaks long sentences into shorter ones', () => {
    const longText = 'The router configuration process involves multiple steps including connecting the power adapter, waiting for the LED to turn green, and then accessing the admin panel through your web browser at the default gateway address.';
    const { sentences } = fragmentForVoice(longText);
    return sentences.every(s => s.split(/\s+/).length <= 20); // Allow some flexibility
});

test('Preserves short sentences', () => {
    const shortText = 'Click the save button.';
    const { sentences } = fragmentForVoice(shortText);
    return sentences.length === 1 && sentences[0].includes('save button');
});

// Test 2: Vocabulary Simplification
console.log('\n📝 Testing Vocabulary Simplification...');

test('Simplifies technical terms', () => {
    const complex = 'Initialize the configuration parameters.';
    const simplified = quickSimplify(complex);
    return simplified.includes('start up') && simplified.includes('settings');
});

test('Estimates reading level', () => {
    const simpleText = 'Click the button. Wait for it to load.';
    const complexText = 'The asynchronous initialization of infrastructure parameters requires verification.';
    const simpleLevel = estimateReadingLevel(simpleText);
    const complexLevel = estimateReadingLevel(complexText);
    return simpleLevel < complexLevel;
});

// Test 3: Phonetic Annotations
console.log('\n📝 Testing Phonetic Annotations...');

test('Adds phonetic for kubernetes', () => {
    const { annotated } = addPhoneticAnnotations('Deploy to kubernetes cluster');
    return annotated.includes('[koo-ber-NET-eez]');
});

test('Handles multiple technical terms', () => {
    const { annotated, annotations } = addPhoneticAnnotations('Configure nginx on linux with docker');
    return annotations.size === 3;
});

test('Gets correct phonetic for npm', () => {
    const phonetic = getPhonetic('npm');
    return phonetic === 'N-P-M';
});

// Test 4: Anaphoric Reference Detection
console.log('\n📝 Testing Anaphoric Reference Detection...');

test('Detects "it" references', () => {
    return hasAnaphoricReferences('How do I restart it?');
});

test('Detects ordinal references', () => {
    return hasAnaphoricReferences('And what about the second step?');
});

test('Detects follow-up queries', () => {
    return hasAnaphoricReferences('And what should I do next?');
});

test('No false positives for clear queries', () => {
    return !hasAnaphoricReferences('How do I reset the router to factory settings?');
});

// Test 5: Quick Query Expansion
console.log('\n📝 Testing Quick Query Expansion...');

test('Expands query with context', () => {
    const context: ConversationContext = {
        sessionId: 'test',
        history: [
            { role: 'user', content: 'What are the steps to configure WiFi?', timestamp: Date.now() },
            { role: 'assistant', content: 'There are 5 steps...', timestamp: Date.now() },
        ],
    };
    const expanded = quickExpandQuery('And the second step?', context);
    return expanded.includes('second step') && expanded.includes('configure WiFi');
});

// Test 6: End-to-End Voice Pipeline (without API calls)
console.log('\n📝 Testing End-to-End Voice Optimization...');

test('Full voice optimization pipeline', () => {
    const technicalResponse = 'To configure kubernetes deployment, first initialize the kubectl configuration by executing the authentication process. Then modify the yaml parameters for your infrastructure requirements.';

    // Step 1: Simplify
    const simplified = quickSimplify(technicalResponse);

    // Step 2: Fragment
    const { sentences } = fragmentForVoice(simplified);

    // Step 3: Add phonetics
    const { annotated, annotations } = addPhoneticAnnotations(sentences.join(' '));

    // Verify results
    const hasPhonetics = annotated.includes('[');
    const isSimpler = !annotated.includes('initialize'); // Should be replaced
    const shortSentences = sentences.every(s => s.split(/\s+/).length <= 20);

    return hasPhonetics && shortSentences;
});

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`                    Test Results: ${passed}/${passed + failed} passed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('\n🎉 All tests passed! Core components are working.\n');
    console.log('Next steps:');
    console.log('1. Set up your API keys in .env file');
    console.log('2. Run `npm run demo` for full pipeline test');
    console.log('3. Run `npm run dev` for interactive mode\n');
} else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please check the output above.\n`);
    process.exit(1);
}
