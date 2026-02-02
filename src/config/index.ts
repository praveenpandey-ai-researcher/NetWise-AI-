import 'dotenv/config';

export const config = {
    // Groq LLM Configuration
    groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 1024,
        temperature: 0.7,
    },

    // ElevenLabs TTS Configuration
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY || '',
        voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
        model: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128' as const,
    },

    // RAG Configuration
    rag: {
        chunkSize: 512,
        chunkOverlap: 50,
        topK: 10,           // Initial retrieval count
        rerankTopK: 3,      // After reranking
        prefetchDebounceMs: 150,
    },

    // Voice Optimization
    voice: {
        maxWordsPerSentence: 15,
        targetGradeLevel: 8,
    },

    // Latency Targets (ms)
    latency: {
        targetTTFB: 800,
        fillerThreshold: 500,  // Start filler if reranking takes longer
    },

    // Conversation Context
    conversation: {
        maxHistoryTurns: 5,
    },
} as const;

// Validation
export function validateConfig(): void {
    const errors: string[] = [];

    if (!config.groq.apiKey) {
        errors.push('GROQ_API_KEY is required. Get one at https://console.groq.com');
    }

    if (!config.elevenlabs.apiKey) {
        errors.push('ELEVENLABS_API_KEY is required. Get one at https://elevenlabs.io');
    }

    if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(e => console.error(`   - ${e}`));
        console.error('\nPlease set these in your .env file');
        process.exit(1);
    }
}

export type Config = typeof config;
