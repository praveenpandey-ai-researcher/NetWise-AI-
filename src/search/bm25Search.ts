import type { DocumentChunk, ScoredChunk } from '../types/index.js';

/**
 * Simple BM25 implementation for keyword-based search
 * BM25 is effective for matching technical terms and exact phrases
 */
class BM25Index {
    private documents: DocumentChunk[] = [];
    private documentFrequencies: Map<string, number> = new Map();
    private avgDocLength: number = 0;
    private k1: number = 1.5;
    private b: number = 0.75;

    /**
     * Tokenize text into terms
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 2);
    }

    /**
     * Add documents to the BM25 index
     */
    addDocuments(chunks: DocumentChunk[]): void {
        let totalLength = 0;

        // Add new documents
        for (const chunk of chunks) {
            if (!this.documents.find(d => d.id === chunk.id)) {
                this.documents.push(chunk);
                const tokens = this.tokenize(chunk.content);
                totalLength += tokens.length;

                // Update document frequencies
                const uniqueTokens = new Set(tokens);
                for (const token of uniqueTokens) {
                    this.documentFrequencies.set(
                        token,
                        (this.documentFrequencies.get(token) || 0) + 1
                    );
                }
            }
        }

        this.avgDocLength = this.documents.length > 0
            ? totalLength / this.documents.length
            : 0;
    }

    /**
     * Calculate BM25 score for a document given a query
     */
    private calculateScore(document: DocumentChunk, queryTokens: string[]): number {
        const docTokens = this.tokenize(document.content);
        const docLength = docTokens.length;
        const termFreqs = new Map<string, number>();

        // Count term frequencies in document
        for (const token of docTokens) {
            termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
        }

        let score = 0;
        const N = this.documents.length;

        for (const queryTerm of queryTokens) {
            const tf = termFreqs.get(queryTerm) || 0;
            if (tf === 0) continue;

            const df = this.documentFrequencies.get(queryTerm) || 0;
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            const numerator = tf * (this.k1 + 1);
            const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

            score += idf * (numerator / denominator);
        }

        return score;
    }

    /**
     * Search for documents matching the query
     */
    search(query: string, topK: number = 10): ScoredChunk[] {
        if (this.documents.length === 0) {
            return [];
        }

        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) {
            return [];
        }

        const scored: ScoredChunk[] = this.documents.map(doc => ({
            ...doc,
            score: this.calculateScore(doc, queryTokens),
            source: 'bm25' as const,
        }));

        return scored
            .filter(doc => doc.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Clear the index
     */
    clear(): void {
        this.documents = [];
        this.documentFrequencies.clear();
        this.avgDocLength = 0;
    }

    /**
     * Get index size
     */
    get size(): number {
        return this.documents.length;
    }
}

// Singleton instance
let bm25Index: BM25Index | null = null;

/**
 * Get or create the BM25 index singleton
 */
export function getBM25Index(): BM25Index {
    if (!bm25Index) {
        bm25Index = new BM25Index();
    }
    return bm25Index;
}

/**
 * Perform BM25 search
 */
export function bm25Search(
    query: string,
    topK: number = 10
): { results: ScoredChunk[]; latencyMs: number } {
    const startTime = Date.now();
    const index = getBM25Index();
    const results = index.search(query, topK);

    return {
        results,
        latencyMs: Date.now() - startTime,
    };
}

/**
 * Index documents into the BM25 index
 */
export function indexBM25Documents(chunks: DocumentChunk[]): void {
    const index = getBM25Index();
    index.addDocuments(chunks);
}
