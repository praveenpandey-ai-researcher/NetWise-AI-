/**
 * Phonetic annotations for technical terms
 * Ensures TTS correctly pronounces domain-specific vocabulary
 */

/**
 * Dictionary of technical terms and their phonetic pronunciations
 */
const PHONETIC_DICTIONARY: Record<string, string> = {
    // Cloud & DevOps
    'kubernetes': 'koo-ber-NET-eez',
    'kubectl': 'KOOB-cuddle',
    'nginx': 'engine-X',
    'linux': 'LIN-ux',
    'unix': 'YOU-nix',
    'sudo': 'SOO-doo',
    'chmod': 'CH-mod',
    'wget': 'W-get',
    'yaml': 'YAM-ul',
    'json': 'JAY-son',
    'sql': 'S-Q-L',
    'nosql': 'no-S-Q-L',
    'graphql': 'GRAF-Q-L',
    'redis': 'RED-iss',
    'mongodb': 'MONG-go-D-B',
    'postgresql': 'post-gres-Q-L',
    'mysql': 'my-S-Q-L',
    'docker': 'DOCK-er',
    'ansible': 'AN-si-bull',
    'terraform': 'TERRA-form',
    'prometheus': 'pro-MEE-thee-us',
    'grafana': 'gruh-FAH-nuh',
    'elasticsearch': 'ee-LAST-ik-search',
    'kibana': 'ki-BAH-nuh',
    'kafka': 'KAF-kuh',

    // Programming
    'api': 'A-P-I',
    'apis': 'A-P-I-z',
    'oauth': 'OH-auth',
    'jwt': 'J-W-T',
    'uuid': 'U-U-I-D',
    'regex': 'REG-ex',
    'async': 'A-sink',
    'await': 'a-WAIT',
    'boolean': 'BOO-lee-an',
    'enum': 'EE-num',
    'tuple': 'TOO-pull',
    'varchar': 'VAR-char',
    'stdin': 'standard-in',
    'stdout': 'standard-out',
    'stderr': 'standard-error',
    'npm': 'N-P-M',
    'pip': 'pip',
    'git': 'git',
    'github': 'GIT-hub',
    'gitlab': 'GIT-lab',
    'bitbucket': 'BIT-bucket',

    // Hardware & Networking
    'cpu': 'C-P-U',
    'gpu': 'G-P-U',
    'ram': 'ram',
    'ssd': 'S-S-D',
    'hdd': 'H-D-D',
    'usb': 'U-S-B',
    'hdmi': 'H-D-M-I',
    'ethernet': 'EETH-er-net',
    'wifi': 'WY-fy',
    'dhcp': 'D-H-C-P',
    'dns': 'D-N-S',
    'tcp': 'T-C-P',
    'udp': 'U-D-P',
    'ip': 'I-P',
    'ipv4': 'I-P-version-4',
    'ipv6': 'I-P-version-6',
    'lan': 'lan',
    'wan': 'wan',
    'vpn': 'V-P-N',
    'ssl': 'S-S-L',
    'tls': 'T-L-S',
    'https': 'H-T-T-P-S',
    'http': 'H-T-T-P',
    'ssh': 'S-S-H',
    'ftp': 'F-T-P',
    'sftp': 'S-F-T-P',
    'nat': 'nat',
    'vlan': 'V-lan',

    // AI/ML
    'llm': 'L-L-M',
    'gpt': 'G-P-T',
    'bert': 'bert',
    'rag': 'rag',
    'ml': 'M-L',
    'ai': 'A-I',
    'nlp': 'N-L-P',
    'cuda': 'KOO-duh',
    'pytorch': 'PY-torch',
    'tensorflow': 'TEN-sur-flow',

    // Companies/Products
    'aws': 'A-W-S',
    'gcp': 'G-C-P',
    'azure': 'AZH-ur',
    'heroku': 'heh-ROH-koo',
    'vercel': 'ver-SELL',
    'netlify': 'NET-li-fy',
};

/**
 * Check if a word should have phonetic annotation
 */
export function needsPhoneticAnnotation(word: string): boolean {
    const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return PHONETIC_DICTIONARY.hasOwnProperty(cleaned);
}

/**
 * Get phonetic pronunciation for a word
 */
export function getPhonetic(word: string): string | null {
    const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return PHONETIC_DICTIONARY[cleaned] || null;
}

/**
 * Add phonetic annotations to text
 * Format: "word [pronunciation]"
 */
export function addPhoneticAnnotations(text: string): {
    annotated: string;
    annotations: Map<string, string>;
    latencyMs: number;
} {
    const startTime = Date.now();
    const annotations = new Map<string, string>();
    const annotatedWords = new Set<string>();

    let result = text;

    // Find and annotate technical terms
    for (const [term, phonetic] of Object.entries(PHONETIC_DICTIONARY)) {
        const regex = new RegExp(`\\b(${term})\\b`, 'gi');

        result = result.replace(regex, (match) => {
            // Only annotate first occurrence of each term
            const lowerMatch = match.toLowerCase();
            if (annotatedWords.has(lowerMatch)) {
                return match;
            }

            annotatedWords.add(lowerMatch);
            annotations.set(match, phonetic);
            return `${match} [${phonetic}]`;
        });
    }

    return {
        annotated: result,
        annotations,
        latencyMs: Date.now() - startTime,
    };
}

/**
 * Remove phonetic annotations (for display purposes)
 */
export function removePhoneticAnnotations(text: string): string {
    return text.replace(/\s*\[[^\]]+\]/g, '');
}

/**
 * Add custom phonetic annotation
 */
export function addCustomPhonetic(term: string, phonetic: string): void {
    PHONETIC_DICTIONARY[term.toLowerCase()] = phonetic;
}

/**
 * Get all known phonetic terms
 */
export function getPhoneticDictionary(): Record<string, string> {
    return { ...PHONETIC_DICTIONARY };
}
