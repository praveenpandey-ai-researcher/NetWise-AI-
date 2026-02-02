import { generateEmbedding, cosineSimilarity } from '../embeddings/localEmbeddings.js';
import type { DocumentChunk, ScoredChunk } from '../types/index.js';

/**
 * In-memory vector store for document chunks
 */
class VectorStore {
    private chunks: DocumentChunk[] = [];
    private embeddings: Map<string, number[]> = new Map();

    /**
     * Add chunks to the vector store
     */
    async addChunks(chunks: DocumentChunk[]): Promise<void> {
        console.log(`📥 Indexing ${chunks.length} chunks...`);

        for (const chunk of chunks) {
            if (!this.embeddings.has(chunk.id)) {
                const embedding = await generateEmbedding(chunk.content);
                this.embeddings.set(chunk.id, embedding);
                chunk.embedding = embedding;
            }

            if (!this.chunks.find(c => c.id === chunk.id)) {
                this.chunks.push(chunk);
            }
        }

        console.log(`✅ Indexed ${this.chunks.length} total chunks`);
    }

    /**
     * Search for similar chunks using vector similarity
     */
    async search(query: string, topK: number = 10): Promise<ScoredChunk[]> {
        if (this.chunks.length === 0) {
            return [];
        }

        const queryEmbedding = await generateEmbedding(query);

        const scored: ScoredChunk[] = this.chunks.map(chunk => {
            const chunkEmbedding = this.embeddings.get(chunk.id) || chunk.embedding;
            if (!chunkEmbedding) {
                return { ...chunk, score: 0, source: 'vector' as const };
            }

            const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
            return { ...chunk, score, source: 'vector' as const };
        });

        // Sort by score descending and return top K
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Get all chunks
     */
    getAllChunks(): DocumentChunk[] {
        return this.chunks;
    }

    /**
     * Clear the store
     */
    clear(): void {
        this.chunks = [];
        this.embeddings.clear();
    }

    /**
     * Get store size
     */
    get size(): number {
        return this.chunks.length;
    }
}

// Singleton instance
let vectorStore: VectorStore | null = null;

/**
 * Get or create the vector store singleton
 */
export function getVectorStore(): VectorStore {
    if (!vectorStore) {
        vectorStore = new VectorStore();
    }
    return vectorStore;
}

/**
 * Perform vector search
 */
export async function vectorSearch(
    query: string,
    topK: number = 10
): Promise<{ results: ScoredChunk[]; latencyMs: number }> {
    const startTime = Date.now();
    const store = getVectorStore();
    const results = await store.search(query, topK);

    return {
        results,
        latencyMs: Date.now() - startTime,
    };
}

/**
 * Index documents into the vector store
 */
export async function indexDocuments(chunks: DocumentChunk[]): Promise<void> {
    const store = getVectorStore();
    await store.addChunks(chunks);
}
