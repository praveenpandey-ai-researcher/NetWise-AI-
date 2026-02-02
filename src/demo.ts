/**
 * Voice AI Assistant - Demo Script
 * Demonstrates the parallelized RAG pipeline with simulated ASR
 */

import 'dotenv/config';
import { config, validateConfig } from './config/index.js';
import { preloadModel } from './embeddings/localEmbeddings.js';
import { indexDocuments } from './search/vectorSearch.js';
import { indexBM25Documents } from './search/bm25Search.js';
import { getOrchestrator } from './pipeline/orchestrator.js';
import { createASRHandler } from './asr/streamingHandler.js';
import type { DocumentChunk } from './types/index.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Load sample manual
 */
async function loadSampleManual(): Promise<DocumentChunk[]> {
    const manualPath = path.join(process.cwd(), 'data', 'sample_manual.json');
    const content = await fs.readFile(manualPath, 'utf-8');
    const manual = JSON.parse(content);

    const chunks: DocumentChunk[] = [];
    let chunkId = 0;

    for (const chapter of manual.chapters) {
        for (const section of chapter.sections) {
            chunks.push({
                id: `chunk-${chunkId++}`,
                content: `${chapter.title} - ${section.title}: ${section.content}`,
                metadata: {
                    source: manual.manual_name,
                    section: section.title,
                },
            });
        }
    }

    return chunks;
}

/**
 * Demo: Simulate a conversation with the voice assistant
 */
async function runDemo(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('       🎤 Voice AI Assistant - Zero Latency RAG Demo');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Initialize
    console.log('📦 Initializing...\n');
    validateConfig();
    await preloadModel();

    const chunks = await loadSampleManual();
    await indexDocuments(chunks);
    indexBM25Documents(chunks);
    console.log(`✅ Loaded ${chunks.length} document chunks\n`);

    const orchestrator = getOrchestrator();
    const asr = createASRHandler();
    const sessionId = 'demo-session';

    // Set up event listeners
    orchestrator.on('event', (event) => {
        const timestamp = new Date(event.timestamp).toISOString().split('T')[1].slice(0, -1);
        console.log(`   [${timestamp}] ${event.type}`);
    });

    orchestrator.on('filler_audio', () => {
        console.log('   🔊 Filler audio ready (would play now)');
    });

    orchestrator.on('response_audio', () => {
        console.log('   🔊 Response audio ready');
    });

    // Demo queries
    const demoQueries = [
        {
            text: "How do I reset my router to factory settings?",
            description: "Basic question about router reset"
        },
        {
            text: "And what should I do after that?",
            description: "Follow-up with anaphoric reference"
        },
        {
            text: "My internet is really slow, what could be causing it?",
            description: "Troubleshooting question"
        },
        {
            text: "How do I update the firmware?",
            description: "Technical how-to question"
        }
    ];

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    Starting Demo Queries');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const demo of demoQueries) {
        console.log(`\n📝 Demo: ${demo.description}`);
        console.log(`❓ Query: "${demo.text}"`);
        console.log('-----------------------------------------------------------');

        console.log('\n⏱️  Pipeline Events:');

        const startTime = Date.now();

        try {
            const { response, voiceText } = await orchestrator.processQuery(
                demo.text,
                sessionId,
                { playAudio: false, skipFiller: true }
            );

            const totalTime = Date.now() - startTime;

            console.log('\n📝 Answer:');
            console.log(`   ${response.answer.substring(0, 200)}...`);

            console.log('\n🔊 Voice-Optimized:');
            console.log(`   ${voiceText.substring(0, 200)}...`);

            console.log(`\n⏱️  Total Time: ${totalTime}ms`);
            console.log(`📊 Sources: ${response.sources.length} relevant chunks found`);
        } catch (error) {
            console.error('❌ Error:', error);
        }

        console.log('\n═══════════════════════════════════════════════════════════════');

        // Pause between demos
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ Demo Complete!\n');
    console.log('Key Features Demonstrated:');
    console.log('  • Query rewriting for follow-up questions');
    console.log('  • Hybrid search (vector + BM25)');
    console.log('  • Cross-encoder reranking');
    console.log('  • Voice-optimized output (short sentences, phonetics)');
    console.log('  • Parallel filler generation for low TTFB');
    console.log('\nRun `npm run dev` for interactive mode.\n');

    process.exit(0);
}

runDemo().catch((error) => {
    console.error('Demo failed:', error);
    process.exit(1);
});
