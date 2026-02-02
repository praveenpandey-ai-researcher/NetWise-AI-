import { EventEmitter } from 'eventemitter3';
import type { PartialTranscript } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Events emitted by the ASR handler
 */
interface ASREvents {
    'partial': (transcript: PartialTranscript) => void;
    'final': (transcript: PartialTranscript) => void;
    'error': (error: Error) => void;
    'ready': () => void;
}

/**
 * Simulated ASR streaming handler
 * In production, this would integrate with a real ASR service like:
 * - Deepgram
 * - AssemblyAI
 * - Google Cloud Speech-to-Text
 * - Azure Speech Services
 * 
 * This implementation simulates streaming transcription for testing
 */
export class ASRStreamingHandler extends EventEmitter<ASREvents> {
    private isListening: boolean = false;
    private currentTranscript: string = '';
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super();
    }

    /**
     * Start listening (simulated)
     */
    start(): void {
        this.isListening = true;
        this.currentTranscript = '';
        this.emit('ready');
        console.log('🎤 ASR listening started (simulated mode)');
    }

    /**
     * Stop listening
     */
    stop(): void {
        this.isListening = false;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        console.log('🎤 ASR listening stopped');
    }

    /**
     * Simulate receiving audio input (for testing)
     * In production, this would receive audio chunks from the microphone
     */
    simulateInput(text: string, options: { isFinal?: boolean } = {}): void {
        if (!this.isListening) {
            return;
        }

        this.currentTranscript = text;

        const transcript: PartialTranscript = {
            text,
            confidence: options.isFinal ? 0.95 : 0.8,
            isFinal: options.isFinal || false,
            timestamp: Date.now(),
        };

        if (options.isFinal) {
            this.emit('final', transcript);
            this.currentTranscript = '';
        } else {
            // Debounce partial transcripts to avoid over-triggering
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.emit('partial', transcript);
            }, config.rag.prefetchDebounceMs);
        }
    }

    /**
     * Simulate progressive speech input (word by word)
     */
    async simulateProgressiveSpeech(
        fullText: string,
        delayMs: number = 150
    ): Promise<void> {
        const words = fullText.split(' ');
        let partial = '';

        for (let i = 0; i < words.length; i++) {
            partial += (i > 0 ? ' ' : '') + words[i];

            // Emit partial for all except the last word
            if (i < words.length - 1) {
                this.simulateInput(partial, { isFinal: false });
            } else {
                // Final word - this is the complete utterance
                this.simulateInput(partial, { isFinal: true });
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    /**
     * Get current partial transcript
     */
    getCurrentTranscript(): string {
        return this.currentTranscript;
    }

    /**
     * Check if currently listening
     */
    getIsListening(): boolean {
        return this.isListening;
    }
}

// Factory function
export function createASRHandler(): ASRStreamingHandler {
    return new ASRStreamingHandler();
}

/**
 * Create a mock ASR handler for testing
 * Immediately emits the full text as final
 */
export function createMockASR(text: string): ASRStreamingHandler {
    const handler = new ASRStreamingHandler();

    setTimeout(() => {
        handler.start();
        handler.simulateInput(text, { isFinal: true });
    }, 0);

    return handler;
}
