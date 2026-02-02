import { generateCompletion, streamCompletion } from './groqClient.js';
import type { ConversationContext } from '../types/index.js';

const FILLER_PROMPTS = [
    "Let me look that up for you...",
    "Just a moment while I find that information...",
    "I'm checking on that now...",
    "Give me a second to find the answer...",
    "Let me search through the documentation...",
];

/**
 * Generate a contextual filler response while RAG is processing
 * This is spoken immediately to reduce perceived latency
 */
export async function generateFillerResponse(
    partialQuery: string,
    context: ConversationContext
): Promise<string> {
    // For very short queries, use a simple filler
    if (partialQuery.length < 20) {
        return FILLER_PROMPTS[Math.floor(Math.random() * FILLER_PROMPTS.length)];
    }

    // For longer queries, generate a contextual acknowledgment
    const systemPrompt = `You are a helpful voice assistant. The user is asking a question and you need to briefly acknowledge their query while you look up the answer. 

Keep your response to ONE short sentence (under 10 words). Be natural and conversational.
Do NOT answer the question - just acknowledge you're looking it up.

Examples:
- "Let me check that for you..."
- "I'll look that up right now..."
- "One moment while I find that..."`;

    const response = await generateCompletion(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User is asking: "${partialQuery}"` },
        ],
        { maxTokens: 30, temperature: 0.8 }
    );

    return response.trim() || FILLER_PROMPTS[0];
}

/**
 * Stream a filler response for immediate TTS
 */
export async function* streamFillerResponse(
    partialQuery: string,
    context: ConversationContext
): AsyncGenerator<string> {
    const systemPrompt = `You are a helpful voice assistant. Briefly acknowledge the user's query while you look up the answer.
Keep it to ONE short sentence (under 10 words). Be natural and friendly.
Do NOT answer - just acknowledge you're checking.`;

    for await (const chunk of streamCompletion(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User asked: "${partialQuery}"` },
        ],
        { maxTokens: 30, temperature: 0.8 }
    )) {
        yield chunk;
    }
}

/**
 * Get a quick static filler (fastest option)
 */
export function getStaticFiller(): string {
    return FILLER_PROMPTS[Math.floor(Math.random() * FILLER_PROMPTS.length)];
}
