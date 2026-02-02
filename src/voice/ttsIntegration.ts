import { ElevenLabsClient } from 'elevenlabs';
import { config } from '../config/index.js';

let elevenlabsClient: ElevenLabsClient | null = null;

/**
 * Get or create the ElevenLabs client singleton
 */
function getElevenLabsClient(): ElevenLabsClient {
    if (!elevenlabsClient) {
        elevenlabsClient = new ElevenLabsClient({
            apiKey: config.elevenlabs.apiKey,
        });
    }
    return elevenlabsClient;
}

/**
 * Convert text to speech and return audio buffer
 */
export async function textToSpeech(
    text: string,
    options: {
        voiceId?: string;
        modelId?: string;
    } = {}
): Promise<{ audio: Buffer; latencyMs: number }> {
    const startTime = Date.now();

    const client = getElevenLabsClient();

    const audioResponse = await client.textToSpeech.convert(
        options.voiceId || config.elevenlabs.voiceId,
        {
            text,
            model_id: options.modelId || config.elevenlabs.model,
        }
    );

    // Collect chunks into a buffer
    const chunks: Uint8Array[] = [];

    // Handle the response based on its type
    if (audioResponse && typeof audioResponse[Symbol.asyncIterator] === 'function') {
        for await (const chunk of audioResponse as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }
    } else if (audioResponse instanceof ArrayBuffer) {
        chunks.push(new Uint8Array(audioResponse));
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return {
        audio: Buffer.from(combined),
        latencyMs: Date.now() - startTime,
    };
}

/**
 * Stream text to speech for lower latency
 * Returns chunks of audio as they become available
 */
export async function* streamTextToSpeech(
    text: string,
    options: {
        voiceId?: string;
        modelId?: string;
    } = {}
): AsyncGenerator<Buffer> {
    const client = getElevenLabsClient();

    const audioResponse = await client.textToSpeech.convert(
        options.voiceId || config.elevenlabs.voiceId,
        {
            text,
            model_id: options.modelId || config.elevenlabs.model,
        }
    );

    if (audioResponse && typeof audioResponse[Symbol.asyncIterator] === 'function') {
        for await (const chunk of audioResponse as AsyncIterable<Uint8Array>) {
            yield Buffer.from(chunk);
        }
    } else if (audioResponse instanceof ArrayBuffer) {
        yield Buffer.from(audioResponse);
    }
}

/**
 * Get available voices
 */
export async function getVoices(): Promise<Array<{ voice_id: string; name: string }>> {
    const client = getElevenLabsClient();
    const response = await client.voices.getAll();

    return response.voices.map((v: { voice_id: string; name?: string }) => ({
        voice_id: v.voice_id,
        name: v.name || 'Unknown',
    }));
}

/**
 * Utility to save audio to file
 */
export async function saveAudioToFile(
    audio: Buffer,
    filepath: string
): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, audio);
}

/**
 * Play audio (requires a player - mainly for testing)
 */
export async function playAudio(audio: Buffer): Promise<void> {
    const path = await import('path');
    const os = await import('os');
    const tempPath = path.join(os.tmpdir(), `voice-ai-${Date.now()}.mp3`);

    await saveAudioToFile(audio, tempPath);
    console.log(`🔊 Audio saved to: ${tempPath}`);

    // Try to play using system command
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
        if (process.platform === 'win32') {
            await execAsync(`start "" "${tempPath}"`);
        } else if (process.platform === 'darwin') {
            await execAsync(`afplay "${tempPath}"`);
        } else {
            await execAsync(`aplay "${tempPath}" || mpv "${tempPath}" || play "${tempPath}"`);
        }
    } catch {
        console.log('Could not auto-play audio. File saved at:', tempPath);
    }
}
