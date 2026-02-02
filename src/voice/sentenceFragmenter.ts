/**
 * Sentence fragmentation for voice output
 * Breaks long sentences into shorter, more natural spoken segments
 * Target: Maximum 15 words per sentence
 */

const MAX_WORDS_PER_SENTENCE = 15;

// Conjunctions and transition phrases that are good break points
const BREAK_POINTS = [
    ', and ',
    ', but ',
    ', or ',
    ', so ',
    ', which ',
    ', where ',
    ', when ',
    ', while ',
    ', although ',
    ', because ',
    ', since ',
    ', however ',
    ', therefore ',
    '; ',
    ' – ',
    ' - ',
];

// Phrases that should not be broken
const KEEP_TOGETHER = [
    /step \d+ of \d+/i,
    /\d+ to \d+/,
    /for example/i,
    /such as/i,
    /in order to/i,
];

/**
 * Count words in a sentence
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Find the best break point in a sentence
 */
function findBreakPoint(sentence: string): number {
    const words = countWords(sentence);

    if (words <= MAX_WORDS_PER_SENTENCE) {
        return -1;
    }

    // Try natural break points first
    for (const breakPoint of BREAK_POINTS) {
        const idx = sentence.indexOf(breakPoint);
        if (idx > 0 && idx < sentence.length - breakPoint.length) {
            const beforeWords = countWords(sentence.substring(0, idx));
            const afterWords = countWords(sentence.substring(idx + breakPoint.length));

            // Ensure both parts are reasonable sizes
            if (beforeWords >= 3 && beforeWords <= MAX_WORDS_PER_SENTENCE &&
                afterWords >= 3) {
                return idx + breakPoint.length - 1;
            }
        }
    }

    // Fallback: break at the middle comma
    const commaMatches = [...sentence.matchAll(/,\s/g)];
    if (commaMatches.length > 0) {
        const middleIdx = Math.floor(commaMatches.length / 2);
        const match = commaMatches[middleIdx];
        if (match.index !== undefined) {
            return match.index + 2;
        }
    }

    // Last resort: break at word boundary near middle
    const targetPos = Math.floor(sentence.length * 0.6);
    const spaceAfter = sentence.indexOf(' ', targetPos);
    if (spaceAfter > 0) {
        return spaceAfter + 1;
    }

    return -1;
}

/**
 * Fragment a single sentence into shorter segments
 */
function fragmentSentence(sentence: string): string[] {
    const trimmed = sentence.trim();

    if (countWords(trimmed) <= MAX_WORDS_PER_SENTENCE) {
        return [trimmed];
    }

    // Check if this sentence should be kept together
    for (const pattern of KEEP_TOGETHER) {
        if (pattern.test(trimmed)) {
            return [trimmed];
        }
    }

    const breakPoint = findBreakPoint(trimmed);
    if (breakPoint === -1) {
        return [trimmed];
    }

    const firstPart = trimmed.substring(0, breakPoint).trim();
    const secondPart = trimmed.substring(breakPoint).trim();

    // Recursively fragment both parts
    return [
        ...fragmentSentence(firstPart),
        ...fragmentSentence(secondPart),
    ];
}

/**
 * Fragment text into voice-optimized sentences
 */
export function fragmentText(text: string): string[] {
    // Split on sentence endings
    const sentences = text
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const result: string[] = [];

    for (const sentence of sentences) {
        const fragments = fragmentSentence(sentence);
        result.push(...fragments);
    }

    return result;
}

/**
 * Add natural pause markers for TTS
 */
export function addPauseMarkers(sentences: string[]): string {
    return sentences
        .map((sentence, i) => {
            // Add slight pause after sentences
            let marked = sentence;

            // No punctuation at end? Add period
            if (!/[.!?]$/.test(marked)) {
                marked += '.';
            }

            return marked;
        })
        .join(' ');
}

/**
 * Main fragmentation function
 */
export function fragmentForVoice(
    text: string
): { sentences: string[]; combined: string; latencyMs: number } {
    const startTime = Date.now();

    const sentences = fragmentText(text);
    const combined = addPauseMarkers(sentences);

    return {
        sentences,
        combined,
        latencyMs: Date.now() - startTime,
    };
}
