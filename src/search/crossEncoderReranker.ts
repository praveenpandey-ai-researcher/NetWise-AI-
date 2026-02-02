import { generateCompletion } from '../llm/groqClient.js';
import type { ScoredChunk } from '../types/index.js';

/**
 * Cross-encoder reranking using LLM for high-quality relevance scoring
 * This is more accurate than bi-encoder but slower, so we run it
 * concurrently with filler generation
 */
export async function crossEncoderRerank(
    query: string,
    chunks: ScoredChunk[],
    topK: number = 3
): Promise<{ results: ScoredChunk[]; latencyMs: number }> {
    const startTime = Date.now();

    if (chunks.length === 0) {
        return { results: [], latencyMs: 0 };
    }

    // If we have few chunks, just return them
    if (chunks.length <= topK) {
        return {
            results: chunks,
            latencyMs: Date.now() - startTime
        };
    }

    // Batch reranking using LLM
    const systemPrompt = `You are a relevance scoring system. Given a query and a list of document passages, rate each passage's relevance to the query on a scale of 0-10.

Output ONLY a JSON array of numbers representing the relevance scores for each passage in order.
Example output: [8, 3, 9, 2, 7]

Be precise:
- 9-10: Directly answers the query
- 7-8: Highly relevant information
- 5-6: Somewhat relevant
- 3-4: Tangentially related
- 0-2: Not relevant`;

    const passages = chunks
        .map((chunk, i) => `[${i}] ${chunk.content.substring(0, 300)}...`)
        .join('\n\n');

    const userPrompt = `Query: "${query}"

Passages to rank:
${passages}

Return only the JSON array of relevance scores:`;

    try {
        const response = await generateCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            { maxTokens: 100, temperature: 0.1 }
        );

        // Parse the scores
        const scoresMatch = response.match(/\[[\d,\s.]+\]/);
        if (!scoresMatch) {
            console.warn('Failed to parse reranker scores, using original order');
            return {
                results: chunks.slice(0, topK),
                latencyMs: Date.now() - startTime
            };
        }

        const scores: number[] = JSON.parse(scoresMatch[0]);

        // Apply scores and rerank
        const reranked = chunks.map((chunk, i) => ({
            ...chunk,
            score: scores[i] ?? chunk.score,
        }));

        const sorted = reranked
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return {
            results: sorted,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        console.error('Reranking failed:', error);
        return {
            results: chunks.slice(0, topK),
            latencyMs: Date.now() - startTime
        };
    }
}

/**
 * Simple heuristic reranking (faster, less accurate)
 * Used as fallback or when speed is critical
 */
export function heuristicRerank(
    query: string,
    chunks: ScoredChunk[],
    topK: number = 3
): ScoredChunk[] {
    const queryTerms = query.toLowerCase().split(/\s+/);

    const reranked = chunks.map(chunk => {
        const content = chunk.content.toLowerCase();

        // Boost score based on exact phrase matches
        let bonus = 0;

        // Check for query phrase in content
        if (content.includes(query.toLowerCase())) {
            bonus += 2;
        }

        // Count query term occurrences
        for (const term of queryTerms) {
            if (term.length > 3 && content.includes(term)) {
                bonus += 0.2;
            }
        }

        // Boost for content that starts with relevant info
        const firstSentence = content.split('.')[0];
        const firstSentenceMatches = queryTerms.filter(t =>
            t.length > 3 && firstSentence.includes(t)
        ).length;
        bonus += firstSentenceMatches * 0.3;

        return {
            ...chunk,
            score: chunk.score + bonus,
        };
    });

    return reranked
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
