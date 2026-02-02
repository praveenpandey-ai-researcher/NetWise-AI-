import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let isInitializing = false;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Initialize the local embedding model
 * Uses all-MiniLM-L6-v2 for fast, high-quality embeddings
 */
async function initEmbeddingModel(): Promise<FeatureExtractionPipeline> {
    if (embeddingPipeline) {
        return embeddingPipeline;
    }

    if (initPromise) {
        return initPromise;
    }

    isInitializing = true;
    console.log('🔄 Loading embedding model (first time may take a moment)...');

    initPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true, // Use quantized model for faster inference
    });

    embeddingPipeline = await initPromise;
    isInitializing = false;
    console.log('✅ Embedding model loaded');

    return embeddingPipeline;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const model = await initEmbeddingModel();

    const output = await model(text, {
        pooling: 'mean',
        normalize: true,
    });

    // Convert to regular array
    return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const model = await initEmbeddingModel();

    const embeddings: number[][] = [];

    // Process in batches of 32 for efficiency
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const outputs = await Promise.all(
            batch.map(async (text) => {
                const output = await model(text, {
                    pooling: 'mean',
                    normalize: true,
                });
                return Array.from(output.data as Float32Array);
            })
        );

        embeddings.push(...outputs);
    }

    return embeddings;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if the embedding model is ready
 */
export function isModelReady(): boolean {
    return embeddingPipeline !== null;
}

/**
 * Check if the model is currently loading
 */
export function isModelLoading(): boolean {
    return isInitializing;
}

/**
 * Preload the embedding model
 */
export async function preloadModel(): Promise<void> {
    await initEmbeddingModel();
}
