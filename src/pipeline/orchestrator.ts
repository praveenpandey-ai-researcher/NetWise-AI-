import { EventEmitter } from 'eventemitter3';
import { config } from '../config/index.js';
import type {
    ConversationContext,
    ScoredChunk,
    PipelineEvent,
    PartialTranscript,
    RAGResponse
} from '../types/index.js';

// Import pipeline components
import { rewriteQuery, quickExpandQuery } from '../rag/queryRewriter.js';
import { vectorSearch, indexDocuments, getVectorStore } from '../search/vectorSearch.js';
import { bm25Search, indexBM25Documents, getBM25Index } from '../search/bm25Search.js';
import { hybridMerge } from '../search/hybridMerge.js';
import { crossEncoderRerank, heuristicRerank } from '../search/crossEncoderReranker.js';
import { generateFillerResponse, getStaticFiller } from '../llm/fillerGenerator.js';
import { streamCompletion, generateCompletion } from '../llm/groqClient.js';
import { fragmentForVoice } from '../voice/sentenceFragmenter.js';
import { quickSimplify, simplifyVocabulary } from '../voice/vocabularySimplifier.js';
import { addPhoneticAnnotations } from '../voice/phoneticAnnotator.js';
import { textToSpeech, streamTextToSpeech, playAudio } from '../voice/ttsIntegration.js';
import { getContext, addUserTurn, addAssistantTurn } from './conversationState.js';
import { getLatencyMonitor } from './latencyMonitor.js';

/**
 * Pipeline events
 */
interface OrchestratorEvents {
    'event': (event: PipelineEvent) => void;
    'filler_audio': (audio: Buffer) => void;
    'response_audio': (audio: Buffer) => void;
    'error': (error: Error) => void;
}

/**
 * Pre-fetch cache for speculative retrieval
 */
interface PrefetchEntry {
    query: string;
    results: ScoredChunk[];
    timestamp: number;
}

/**
 * Main pipeline orchestrator
 * Implements parallel execution for low-latency responses
 */
export class PipelineOrchestrator extends EventEmitter<OrchestratorEvents> {
    private prefetchCache: Map<string, PrefetchEntry> = new Map();
    private activePrefetch: AbortController | null = null;

    constructor() {
        super();
    }

    /**
     * Emit a pipeline event
     */
    private emitEvent(type: PipelineEvent['type'], data?: unknown): void {
        this.emit('event', {
            type,
            timestamp: Date.now(),
            data,
        });
    }

    /**
     * Handle partial transcript for pre-fetching
     * This runs speculatively before the user finishes speaking
     */
    async handlePartialTranscript(
        partial: PartialTranscript,
        sessionId: string
    ): Promise<void> {
        // Cancel any existing prefetch
        if (this.activePrefetch) {
            this.activePrefetch.abort();
        }
        this.activePrefetch = new AbortController();

        this.emitEvent('prefetch_started', { query: partial.text });

        try {
            const context = getContext(sessionId);

            // Quick query expansion (heuristic, no LLM call)
            const expandedQuery = quickExpandQuery(partial.text, context);

            // Run hybrid search in parallel
            const [vectorResults, bm25Results] = await Promise.all([
                vectorSearch(expandedQuery, config.rag.topK),
                Promise.resolve(bm25Search(expandedQuery, config.rag.topK)),
            ]);

            // Check if aborted
            if (this.activePrefetch?.signal.aborted) {
                return;
            }

            // Merge results
            const { results } = hybridMerge(
                vectorResults.results,
                bm25Results.results,
                config.rag.topK
            );

            // Cache for later use
            this.prefetchCache.set(this.getCacheKey(partial.text), {
                query: partial.text,
                results,
                timestamp: Date.now(),
            });

            this.emitEvent('prefetch_complete', {
                query: partial.text,
                resultCount: results.length
            });
        } catch (error) {
            // Prefetch errors are non-fatal
            console.warn('Prefetch failed:', error);
        }
    }

    /**
     * Get cache key for a query
     */
    private getCacheKey(query: string): string {
        return query.toLowerCase().trim();
    }

    /**
     * Check for cached prefetch results
     */
    private checkPrefetchCache(query: string): ScoredChunk[] | null {
        const key = this.getCacheKey(query);
        const entry = this.prefetchCache.get(key);

        if (entry && Date.now() - entry.timestamp < 5000) {
            return entry.results;
        }

        // Also check for similar queries (prefix match)
        for (const [cacheKey, cacheEntry] of this.prefetchCache.entries()) {
            if (key.startsWith(cacheKey) && Date.now() - cacheEntry.timestamp < 5000) {
                return cacheEntry.results;
            }
        }

        return null;
    }

    /**
     * Main pipeline execution
     * Processes a final transcript and generates audio response
     */
    async processQuery(
        query: string,
        sessionId: string,
        options: {
            playAudio?: boolean;
            skipFiller?: boolean;
        } = {}
    ): Promise<{
        response: RAGResponse;
        voiceText: string;
        audio?: Buffer;
    }> {
        const monitor = getLatencyMonitor();
        const runId = `run-${Date.now()}`;
        monitor.startRun(runId);

        this.emitEvent('final_transcript', { query });

        const context = getContext(sessionId);
        addUserTurn(sessionId, query);

        // Step 1: Query Rewriting (parallel with filler generation)
        const rewritePromise = rewriteQuery(query, context);

        // Step 2: Generate filler response while reranking happens
        let fillerPromise: Promise<{ text: string; audio: Buffer }> | null = null;
        if (!options.skipFiller) {
            fillerPromise = (async () => {
                const fillerText = await generateFillerResponse(query, context);
                this.emitEvent('filler_started', { text: fillerText });

                const { audio } = await textToSpeech(fillerText);
                this.emitEvent('filler_audio_ready');
                this.emit('filler_audio', audio);

                // Record TTFB when filler audio is ready
                monitor.recordFirstByte();

                return { text: fillerText, audio };
            })();
        }

        // Step 3: Get or fetch search results
        const { rewritten, wasRewritten, latencyMs: rewriteLatency } = await rewritePromise;
        monitor.recordLatency('queryRewriteLatencyMs', rewriteLatency);

        const searchQuery = rewritten;
        let searchResults = this.checkPrefetchCache(query);
        let searchLatency = 0;

        if (!searchResults) {
            const searchStart = Date.now();

            // Run vector and BM25 search in parallel
            const [vectorResults, bm25Results] = await Promise.all([
                vectorSearch(searchQuery, config.rag.topK),
                Promise.resolve(bm25Search(searchQuery, config.rag.topK)),
            ]);

            const { results } = hybridMerge(
                vectorResults.results,
                bm25Results.results,
                config.rag.topK
            );

            searchResults = results;
            searchLatency = Date.now() - searchStart;
        }

        monitor.recordLatency('searchLatencyMs', searchLatency);

        // Step 4: Cross-encoder reranking (expensive, run with filler)
        const { results: rerankedResults, latencyMs: rerankLatency } =
            await crossEncoderRerank(searchQuery, searchResults, config.rag.rerankTopK);
        monitor.recordLatency('rerankLatencyMs', rerankLatency);

        // Step 5: Generate response using LLM
        const llmStart = Date.now();
        const responseText = await this.generateRAGResponse(searchQuery, rerankedResults, context);
        monitor.recordLatency('llmLatencyMs', Date.now() - llmStart);

        // Step 6: Voice optimization
        const voiceOptStart = Date.now();
        const voiceText = await this.optimizeForVoice(responseText);
        monitor.recordLatency('voiceOptLatencyMs', Date.now() - voiceOptStart);

        this.emitEvent('voice_optimized', { text: voiceText });

        // If no filler was generated, record first byte now
        if (options.skipFiller) {
            monitor.recordFirstByte();
        }

        // Step 7: TTS generation
        this.emitEvent('tts_started');
        const ttsStart = Date.now();
        const { audio } = await textToSpeech(voiceText);
        monitor.recordLatency('ttsLatencyMs', Date.now() - ttsStart);

        this.emit('response_audio', audio);
        this.emitEvent('tts_complete');

        // Record assistant response
        addAssistantTurn(sessionId, responseText);

        // End monitoring
        monitor.endRun(runId);

        this.emitEvent('response_complete');

        // Play audio if requested
        if (options.playAudio) {
            // If we have filler, play it first
            if (fillerPromise) {
                try {
                    const filler = await fillerPromise;
                    await playAudio(filler.audio);
                } catch (e) {
                    // Filler failed, continue with main response
                }
            }
            await playAudio(audio);
        }

        return {
            response: {
                answer: responseText,
                sources: rerankedResults,
                confidence: rerankedResults[0]?.score || 0,
                latencyMs: Date.now() - (Date.now() - monitor.endRun(runId).totalLatencyMs),
            },
            voiceText,
            audio,
        };
    }

    /**
     * Generate RAG response using retrieved context
     */
    private async generateRAGResponse(
        query: string,
        chunks: ScoredChunk[],
        context: ConversationContext
    ): Promise<string> {
        if (chunks.length === 0) {
            return "I couldn't find relevant information in the documentation. Could you rephrase your question?";
        }

        const contextText = chunks
            .map((chunk, i) => `[Source ${i + 1}]: ${chunk.content}`)
            .join('\n\n');

        const systemPrompt = `You are a helpful voice assistant that answers questions based on the provided documentation.

IMPORTANT RULES:
1. Answer based ONLY on the provided sources
2. Keep answers concise and clear (this will be spoken aloud)
3. If the sources don't contain the answer, say so
4. Use simple, natural language
5. Avoid overly technical jargon unless necessary
6. Structure answers as if you're speaking to someone

Sources:
${contextText}`;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];

        // Add conversation history for context
        for (const turn of context.history.slice(-4)) {
            messages.push({
                role: turn.role,
                content: turn.content,
            });
        }

        // Add current query
        messages.push({ role: 'user', content: query });

        return generateCompletion(messages, { temperature: 0.5 });
    }

    /**
     * Optimize text for voice output
     */
    private async optimizeForVoice(text: string): Promise<string> {
        // Step 1: Simplify vocabulary
        const simplified = quickSimplify(text);

        // Step 2: Fragment into short sentences
        const { combined: fragmented } = fragmentForVoice(simplified);

        // Step 3: Add phonetic annotations
        const { annotated } = addPhoneticAnnotations(fragmented);

        return annotated;
    }

    /**
     * Clear caches
     */
    clearCaches(): void {
        this.prefetchCache.clear();
        if (this.activePrefetch) {
            this.activePrefetch.abort();
            this.activePrefetch = null;
        }
    }
}

// Singleton instance
let orchestrator: PipelineOrchestrator | null = null;

/**
 * Get the pipeline orchestrator singleton
 */
export function getOrchestrator(): PipelineOrchestrator {
    if (!orchestrator) {
        orchestrator = new PipelineOrchestrator();
    }
    return orchestrator;
}

/**
 * Quick helper for processing a query
 */
export async function processQuery(
    query: string,
    sessionId: string = 'default',
    options: { playAudio?: boolean; skipFiller?: boolean } = {}
): Promise<{
    response: RAGResponse;
    voiceText: string;
    audio?: Buffer;
}> {
    return getOrchestrator().processQuery(query, sessionId, options);
}
