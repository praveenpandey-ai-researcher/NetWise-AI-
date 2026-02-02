import { generateCompletion } from '../llm/groqClient.js';
import type { ConversationContext, ConversationTurn } from '../types/index.js';

/**
 * Patterns that indicate anaphoric references needing resolution
 */
const ANAPHORIC_PATTERNS = [
    /\b(it|this|that|these|those)\b/i,
    /\b(the (?:first|second|third|fourth|fifth|last|next|previous) (?:one|step|item|option|thing))\b/i,
    /\b(what about|how about|and the|also the)\b/i,
    /\b(same|another|other|more)\b/i,
    /^(and |also |but |or |what about )/i,
];

/**
 * Check if a query contains anaphoric references that need resolution
 */
export function hasAnaphoricReferences(query: string): boolean {
    return ANAPHORIC_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Format conversation history for the LLM
 */
function formatHistory(history: ConversationTurn[]): string {
    return history
        .slice(-5) // Last 5 turns
        .map(turn => `${turn.role.toUpperCase()}: ${turn.content}`)
        .join('\n');
}

/**
 * Rewrite a query to resolve anaphoric references using conversation context
 * 
 * Example:
 * History: ["What are the steps to restart the server?", "There are 5 steps..."]
 * Query: "And what about the second one?"
 * Rewritten: "What is the second step to restart the server?"
 */
export async function rewriteQuery(
    query: string,
    context: ConversationContext
): Promise<{ rewritten: string; wasRewritten: boolean; latencyMs: number }> {
    const startTime = Date.now();

    // If no history or no anaphoric references, return original
    if (context.history.length === 0 || !hasAnaphoricReferences(query)) {
        return {
            rewritten: query,
            wasRewritten: false,
            latencyMs: Date.now() - startTime,
        };
    }

    const systemPrompt = `You are a query rewriter. Your task is to resolve ambiguous references in a user's follow-up question by using the conversation history.

Rules:
1. If the query has pronouns like "it", "that", "this", replace them with what they refer to
2. If the query mentions "the second one", "the first step", etc., resolve what that refers to
3. If the query is incomplete (starts with "and", "also", "what about"), complete it
4. Keep the rewritten query natural and conversational
5. If no rewriting is needed, return the original query exactly
6. Output ONLY the rewritten query, nothing else

Conversation history:
${formatHistory(context.history)}

Rewrite the following query:`;

    try {
        const rewritten = await generateCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            { maxTokens: 150, temperature: 0.3 }
        );

        const cleanedRewritten = rewritten.trim();
        const wasRewritten = cleanedRewritten.toLowerCase() !== query.toLowerCase();

        return {
            rewritten: cleanedRewritten || query,
            wasRewritten,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        console.error('Query rewriting failed:', error);
        return {
            rewritten: query,
            wasRewritten: false,
            latencyMs: Date.now() - startTime,
        };
    }
}

/**
 * Quick heuristic-based query expansion (no LLM call)
 * Used for pre-fetch when speed is critical
 */
export function quickExpandQuery(
    query: string,
    context: ConversationContext
): string {
    if (context.history.length === 0) {
        return query;
    }

    // Get the last user query for context
    const lastUserTurn = [...context.history]
        .reverse()
        .find(turn => turn.role === 'user');

    if (!lastUserTurn) {
        return query;
    }

    // Simple heuristic expansions
    let expanded = query;

    // Handle "the second/third/etc one"
    const ordinalMatch = query.match(/\b(first|second|third|fourth|fifth|last)\s+(one|step|item|option|thing)\b/i);
    if (ordinalMatch) {
        expanded = `${ordinalMatch[0]} from "${lastUserTurn.content}"`;
    }

    // Handle queries starting with conjunctions
    if (/^(and|also|but|or)\s+/i.test(query)) {
        expanded = `In the context of "${lastUserTurn.content}", ${query}`;
    }

    return expanded;
}
