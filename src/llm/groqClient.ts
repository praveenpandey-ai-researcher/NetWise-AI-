import Groq from 'groq-sdk';
import { config } from '../config/index.js';

let groqClient: Groq | null = null;

/**
 * Get or create the Groq client singleton
 */
export function getGroqClient(): Groq {
    if (!groqClient) {
        groqClient = new Groq({
            apiKey: config.groq.apiKey,
        });
    }
    return groqClient;
}

/**
 * Generate a streaming completion from Groq
 */
export async function* streamCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
        maxTokens?: number;
        temperature?: number;
    } = {}
): AsyncGenerator<string> {
    const client = getGroqClient();

    const stream = await client.chat.completions.create({
        model: config.groq.model,
        messages,
        max_tokens: options.maxTokens ?? config.groq.maxTokens,
        temperature: options.temperature ?? config.groq.temperature,
        stream: true,
    });

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
            yield content;
        }
    }
}

/**
 * Generate a complete response from Groq (non-streaming)
 */
export async function generateCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<string> {
    const client = getGroqClient();

    const response = await client.chat.completions.create({
        model: config.groq.model,
        messages,
        max_tokens: options.maxTokens ?? config.groq.maxTokens,
        temperature: options.temperature ?? config.groq.temperature,
        stream: false,
    });

    return response.choices[0]?.message?.content || '';
}

/**
 * Generate embeddings using Groq (or fallback to local)
 * Note: Groq doesn't have native embeddings, so we use local transformers
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    // This will be handled by the local embedding module
    throw new Error('Use localEmbeddings module instead');
}
