/**
 * Voice AI Assistant - Main Entry Point
 * Zero-latency voice knowledge base with parallelized RAG pipeline
 */

import 'dotenv/config';
import { config, validateConfig } from './config/index.js';
import { preloadModel } from './embeddings/localEmbeddings.js';
import { indexDocuments, getVectorStore } from './search/vectorSearch.js';
import { indexBM25Documents, getBM25Index } from './search/bm25Search.js';
import { getOrchestrator, processQuery } from './pipeline/orchestrator.js';
import { createASRHandler } from './asr/streamingHandler.js';
import type { DocumentChunk } from './types/index.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Load and chunk a sample manual
 */
async function loadSampleManual(): Promise<DocumentChunk[]> {
    const manualPath = path.join(process.cwd(), 'data', 'sample_manual.json');

    try {
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
    } catch (error) {
        console.error('Failed to load sample manual:', error);
        return [];
    }
}

/**
 * Initialize the system
 */
async function initialize(): Promise<void> {
    console.log('🚀 Voice AI Assistant Starting...\n');

    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated\n');

    // Preload embedding model
    console.log('📦 Loading embedding model...');
    await preloadModel();

    // Load and index documents
    console.log('📚 Loading sample documents...');
    const chunks = await loadSampleManual();

    if (chunks.length > 0) {
        console.log(`📄 Found ${chunks.length} document chunks`);

        // Index in both vector and BM25 stores
        await indexDocuments(chunks);
        indexBM25Documents(chunks);

        console.log('✅ Documents indexed\n');
    } else {
        console.warn('⚠️ No documents loaded. Add documents to data/sample_manual.json\n');
    }

    console.log('✅ Voice AI Assistant Ready!\n');
}

/**
 * Interactive REPL for testing
 */
async function startREPL(): Promise<void> {
    const readline = await import('readline');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('💬 Enter your questions (type "exit" to quit):');
    console.log('   Tip: Ask follow-up questions like "And what about the second step?"\n');

    const sessionId = 'repl-session';

    const askQuestion = () => {
        rl.question('You: ', async (query) => {
            if (query.toLowerCase() === 'exit') {
                console.log('\n👋 Goodbye!');
                rl.close();
                process.exit(0);
            }

            if (!query.trim()) {
                askQuestion();
                return;
            }

            try {
                console.log('\n🤔 Processing...');

                const { response, voiceText } = await processQuery(query, sessionId, {
                    playAudio: false,
                    skipFiller: true, // Skip filler in text mode
                });

                console.log('\n📝 Response:');
                console.log(response.answer);

                console.log('\n🔊 Voice-optimized text:');
                console.log(voiceText);

                if (response.sources.length > 0) {
                    console.log('\n📚 Sources:');
                    response.sources.forEach((source, i) => {
                        console.log(`   ${i + 1}. ${source.metadata.section || 'Document'} (score: ${source.score.toFixed(3)})`);
                    });
                }

                console.log('');
            } catch (error) {
                console.error('\n❌ Error:', error);
            }

            askQuestion();
        });
    };

    askQuestion();
}

/**
 * Main function
 */
async function main(): Promise<void> {
    try {
        await initialize();
        await startREPL();
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Export for use as module
export { initialize, processQuery };

// Run if executed directly
main().catch(console.error);
