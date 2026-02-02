/**
 * Common types used across the voice AI assistant
 */

// Conversation Types
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ConversationContext {
    history: ConversationTurn[];
    sessionId: string;
}

// ASR Types
export interface PartialTranscript {
    text: string;
    confidence: number;
    isFinal: boolean;
    timestamp: number;
}

// Document Types
export interface DocumentChunk {
    id: string;
    content: string;
    metadata: {
        source: string;
        page?: number;
        section?: string;
    };
    embedding?: number[];
}

export interface ScoredChunk extends DocumentChunk {
    score: number;
    source: 'vector' | 'bm25' | 'hybrid';
}

// Search Types
export interface SearchResult {
    chunks: ScoredChunk[];
    query: string;
    rewrittenQuery?: string;
    latencyMs: number;
}

// RAG Types
export interface RAGResponse {
    answer: string;
    sources: ScoredChunk[];
    confidence: number;
    latencyMs: number;
}

// Voice Types
export interface VoiceOptimizedText {
    original: string;
    optimized: string;
    sentences: string[];
    phoneticAnnotations: Map<string, string>;
}

// Pipeline Types
export interface PipelineMetrics {
    asrLatencyMs: number;
    queryRewriteLatencyMs: number;
    searchLatencyMs: number;
    rerankLatencyMs: number;
    llmLatencyMs: number;
    voiceOptLatencyMs: number;
    ttsLatencyMs: number;
    totalLatencyMs: number;
    ttfbMs: number;
}

export type PipelineEventType =
    | 'partial_transcript'
    | 'final_transcript'
    | 'prefetch_started'
    | 'prefetch_complete'
    | 'filler_started'
    | 'filler_audio_ready'
    | 'rag_complete'
    | 'voice_optimized'
    | 'tts_started'
    | 'tts_complete'
    | 'response_complete';

export interface PipelineEvent {
    type: PipelineEventType;
    timestamp: number;
    data?: unknown;
}
