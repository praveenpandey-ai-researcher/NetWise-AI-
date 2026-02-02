import type { ScoredChunk } from '../types/index.js';

/**
 * Reciprocal Rank Fusion (RRF) for merging results from multiple retrieval methods
 * 
 * RRF combines rankings from different sources using the formula:
 * RRF(d) = Σ 1/(k + rank(d))
 * 
 * where k is a constant (typically 60) that mitigates the impact of high rankings
 */
export function reciprocalRankFusion(
    resultSets: ScoredChunk[][],
    k: number = 60
): ScoredChunk[] {
    const rrfScores = new Map<string, { chunk: ScoredChunk; score: number }>();

    for (const results of resultSets) {
        for (let rank = 0; rank < results.length; rank++) {
            const chunk = results[rank];
            const rrfScore = 1 / (k + rank + 1); // +1 because rank is 0-indexed

            const existing = rrfScores.get(chunk.id);
            if (existing) {
                existing.score += rrfScore;
                // Keep the higher individual score for reference
                if (chunk.score > existing.chunk.score) {
                    existing.chunk = { ...chunk, source: 'hybrid' };
                }
            } else {
                rrfScores.set(chunk.id, {
                    chunk: { ...chunk, source: 'hybrid' },
                    score: rrfScore,
                });
            }
        }
    }

    // Convert to array and sort by RRF score
    return Array.from(rrfScores.values())
        .sort((a, b) => b.score - a.score)
        .map(item => ({
            ...item.chunk,
            score: item.score,
        }));
}

/**
 * Weighted combination of results
 * Useful when one source is more reliable than another
 */
export function weightedMerge(
    resultSets: { results: ScoredChunk[]; weight: number }[]
): ScoredChunk[] {
    const mergedScores = new Map<string, { chunk: ScoredChunk; score: number }>();

    for (const { results, weight } of resultSets) {
        // Normalize scores within each result set
        const maxScore = Math.max(...results.map(r => r.score), 0.001);

        for (const chunk of results) {
            const normalizedScore = (chunk.score / maxScore) * weight;

            const existing = mergedScores.get(chunk.id);
            if (existing) {
                existing.score += normalizedScore;
            } else {
                mergedScores.set(chunk.id, {
                    chunk: { ...chunk, source: 'hybrid' },
                    score: normalizedScore,
                });
            }
        }
    }

    return Array.from(mergedScores.values())
        .sort((a, b) => b.score - a.score)
        .map(item => ({
            ...item.chunk,
            score: item.score,
        }));
}

/**
 * Perform hybrid merge using RRF
 */
export function hybridMerge(
    vectorResults: ScoredChunk[],
    bm25Results: ScoredChunk[],
    topK: number = 10
): { results: ScoredChunk[]; latencyMs: number } {
    const startTime = Date.now();

    const merged = reciprocalRankFusion([vectorResults, bm25Results]);

    return {
        results: merged.slice(0, topK),
        latencyMs: Date.now() - startTime,
    };
}
