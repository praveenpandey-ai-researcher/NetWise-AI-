"""
Voice AI Assistant - Phonetic Annotator
Adds phonetic annotations for technical terms to help TTS pronunciation
"""

import re
import time
from typing import Dict, Tuple


# Dictionary of technical terms and their phonetic pronunciations
PHONETIC_DICTIONARY: Dict[str, str] = {
    # Cloud & DevOps
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
    
    # Programming
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
    
    # Hardware & Networking
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
    
    # AI/ML
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
    
    # Companies/Products
    'aws': 'A-W-S',
    'gcp': 'G-C-P',
    'azure': 'AZH-ur',
    'heroku': 'heh-ROH-koo',
    'vercel': 'ver-SELL',
    'netlify': 'NET-li-fy',
}


def needs_phonetic_annotation(word: str) -> bool:
    """Check if a word should have phonetic annotation"""
    cleaned = re.sub(r'[^a-z0-9]', '', word.lower())
    return cleaned in PHONETIC_DICTIONARY


def get_phonetic(word: str) -> str | None:
    """Get phonetic pronunciation for a word"""
    cleaned = re.sub(r'[^a-z0-9]', '', word.lower())
    return PHONETIC_DICTIONARY.get(cleaned)


def add_phonetic_annotations(text: str) -> Tuple[str, Dict[str, str], float]:
    """
    Add phonetic annotations to text
    Format: "word [pronunciation]"
    
    Returns:
        Tuple of (annotated_text, annotations_dict, latency_ms)
    """
    start_time = time.time()
    annotations: Dict[str, str] = {}
    annotated_words: set = set()
    
    result = text
    
    # Find and annotate technical terms
    for term, phonetic in PHONETIC_DICTIONARY.items():
        pattern = re.compile(r'\b(' + re.escape(term) + r')\b', re.IGNORECASE)
        
        def replace_func(match):
            matched = match.group(0)
            lower_match = matched.lower()
            
            # Only annotate first occurrence of each term
            if lower_match in annotated_words:
                return matched
            
            annotated_words.add(lower_match)
            annotations[matched] = phonetic
            return f'{matched} [{phonetic}]'
        
        result = pattern.sub(replace_func, result)
    
    latency_ms = (time.time() - start_time) * 1000
    
    return result, annotations, latency_ms


def remove_phonetic_annotations(text: str) -> str:
    """Remove phonetic annotations (for display purposes)"""
    return re.sub(r'\s*\[[^\]]+\]', '', text)


def add_custom_phonetic(term: str, phonetic: str) -> None:
    """Add a custom phonetic annotation"""
    PHONETIC_DICTIONARY[term.lower()] = phonetic


def get_phonetic_dictionary() -> Dict[str, str]:
    """Get a copy of the phonetic dictionary"""
    return PHONETIC_DICTIONARY.copy()
