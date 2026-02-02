import { generateCompletion } from '../llm/groqClient.js';

/**
 * Common technical terms and their grade-8 level alternatives
 */
const VOCABULARY_MAP: Record<string, string> = {
    // Technical terms
    'initialize': 'start up',
    'terminate': 'end',
    'execute': 'run',
    'implementation': 'setup',
    'configuration': 'settings',
    'parameters': 'settings',
    'authenticate': 'log in',
    'authorization': 'permission',
    'instantiate': 'create',
    'deprecated': 'outdated',
    'propagate': 'spread',
    'allocate': 'assign',
    'deallocate': 'free up',
    'concatenate': 'join together',
    'enumeration': 'list',
    'subsequent': 'next',
    'preceding': 'previous',
    'utilize': 'use',
    'facilitate': 'help with',
    'functionality': 'features',
    'methodology': 'method',
    'prerequisite': 'requirement',
    'comprehensive': 'complete',
    'modification': 'change',
    'verification': 'check',
    'synchronize': 'sync',
    'asynchronous': 'running in background',
    'concurrent': 'at the same time',
    'repository': 'storage',
    'deployment': 'release',
    'infrastructure': 'system',
    'latency': 'delay',
    'bandwidth': 'data speed',
    'throughput': 'speed',
    'redundancy': 'backup',
    'escalation': 'passing up',
};

/**
 * Quick vocabulary simplification using lookup table
 */
export function quickSimplify(text: string): string {
    let result = text;

    for (const [complex, simple] of Object.entries(VOCABULARY_MAP)) {
        const regex = new RegExp(`\\b${complex}\\b`, 'gi');
        result = result.replace(regex, simple);
    }

    return result;
}

/**
 * LLM-based vocabulary simplification for complex passages
 * Targets grade-8 reading level while preserving accuracy
 */
export async function simplifyVocabulary(
    text: string,
    preserveTerms: string[] = []
): Promise<{ simplified: string; latencyMs: number }> {
    const startTime = Date.now();

    // If text is short, use quick simplification
    if (text.length < 200) {
        return {
            simplified: quickSimplify(text),
            latencyMs: Date.now() - startTime,
        };
    }

    const preserveList = preserveTerms.length > 0
        ? `\nPreserve these technical terms exactly: ${preserveTerms.join(', ')}`
        : '';

    const systemPrompt = `You are a text simplifier. Rewrite the given text for a grade 8 reading level (13-14 year old).

Rules:
1. Use simpler words where possible
2. Keep sentences short and clear
3. Maintain technical accuracy - don't remove important information
4. Keep the same meaning and intent${preserveList}
5. Output ONLY the simplified text, nothing else`;

    try {
        const simplified = await generateCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text },
            ],
            { maxTokens: 500, temperature: 0.3 }
        );

        return {
            simplified: simplified.trim(),
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        console.error('Vocabulary simplification failed:', error);
        return {
            simplified: quickSimplify(text),
            latencyMs: Date.now() - startTime,
        };
    }
}

/**
 * Check approximate reading level (simplified Flesch-Kincaid)
 */
export function estimateReadingLevel(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => {
        return count + countSyllables(word);
    }, 0);

    if (sentences.length === 0 || words.length === 0) {
        return 0;
    }

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    // Flesch-Kincaid Grade Level formula
    const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

    return Math.max(0, Math.round(gradeLevel * 10) / 10);
}

/**
 * Simple syllable counter
 */
function countSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length <= 3) return 1;

    const vowelGroups = cleaned.match(/[aeiouy]+/g) || [];
    let count = vowelGroups.length;

    // Adjust for silent e
    if (cleaned.endsWith('e') && count > 1) {
        count--;
    }

    return Math.max(1, count);
}
