import type { PipelineMetrics } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Tracks latency metrics for the pipeline
 */
class LatencyMonitor {
    private metrics: Map<string, PipelineMetrics[]> = new Map();
    private currentRun: Partial<PipelineMetrics> = {};
    private startTime: number = 0;
    private firstByteTime: number = 0;

    /**
     * Start tracking a new pipeline run
     */
    startRun(runId: string): void {
        this.currentRun = {};
        this.startTime = Date.now();
        this.firstByteTime = 0;
    }

    /**
     * Record Time to First Byte
     */
    recordFirstByte(): void {
        if (this.firstByteTime === 0) {
            this.firstByteTime = Date.now();
            this.currentRun.ttfbMs = this.firstByteTime - this.startTime;
        }
    }

    /**
     * Record a component's latency
     */
    recordLatency(
        component: keyof Omit<PipelineMetrics, 'totalLatencyMs' | 'ttfbMs'>,
        latencyMs: number
    ): void {
        this.currentRun[component] = latencyMs;
    }

    /**
     * End the run and store metrics
     */
    endRun(runId: string): PipelineMetrics {
        const totalLatency = Date.now() - this.startTime;

        const finalMetrics: PipelineMetrics = {
            asrLatencyMs: this.currentRun.asrLatencyMs || 0,
            queryRewriteLatencyMs: this.currentRun.queryRewriteLatencyMs || 0,
            searchLatencyMs: this.currentRun.searchLatencyMs || 0,
            rerankLatencyMs: this.currentRun.rerankLatencyMs || 0,
            llmLatencyMs: this.currentRun.llmLatencyMs || 0,
            voiceOptLatencyMs: this.currentRun.voiceOptLatencyMs || 0,
            ttsLatencyMs: this.currentRun.ttsLatencyMs || 0,
            totalLatencyMs: totalLatency,
            ttfbMs: this.currentRun.ttfbMs || totalLatency,
        };

        // Store metrics
        const runMetrics = this.metrics.get(runId) || [];
        runMetrics.push(finalMetrics);
        this.metrics.set(runId, runMetrics);

        // Log metrics
        this.logMetrics(finalMetrics);

        return finalMetrics;
    }

    /**
     * Log metrics to console
     */
    private logMetrics(metrics: PipelineMetrics): void {
        const ttfbStatus = metrics.ttfbMs <= config.latency.targetTTFB ? '✅' : '⚠️';

        console.log('\n📊 Pipeline Metrics:');
        console.log(`   TTFB: ${metrics.ttfbMs}ms ${ttfbStatus} (target: <${config.latency.targetTTFB}ms)`);
        console.log(`   Total: ${metrics.totalLatencyMs}ms`);
        console.log(`   Breakdown:`);
        console.log(`     - ASR: ${metrics.asrLatencyMs}ms`);
        console.log(`     - Query Rewrite: ${metrics.queryRewriteLatencyMs}ms`);
        console.log(`     - Search: ${metrics.searchLatencyMs}ms`);
        console.log(`     - Rerank: ${metrics.rerankLatencyMs}ms`);
        console.log(`     - LLM: ${metrics.llmLatencyMs}ms`);
        console.log(`     - Voice Opt: ${metrics.voiceOptLatencyMs}ms`);
        console.log(`     - TTS: ${metrics.ttsLatencyMs}ms`);
    }

    /**
     * Get average metrics for a run
     */
    getAverageMetrics(runId: string): PipelineMetrics | null {
        const runMetrics = this.metrics.get(runId);
        if (!runMetrics || runMetrics.length === 0) {
            return null;
        }

        const avg = (key: keyof PipelineMetrics) => {
            return Math.round(
                runMetrics.reduce((sum, m) => sum + m[key], 0) / runMetrics.length
            );
        };

        return {
            asrLatencyMs: avg('asrLatencyMs'),
            queryRewriteLatencyMs: avg('queryRewriteLatencyMs'),
            searchLatencyMs: avg('searchLatencyMs'),
            rerankLatencyMs: avg('rerankLatencyMs'),
            llmLatencyMs: avg('llmLatencyMs'),
            voiceOptLatencyMs: avg('voiceOptLatencyMs'),
            ttsLatencyMs: avg('ttsLatencyMs'),
            totalLatencyMs: avg('totalLatencyMs'),
            ttfbMs: avg('ttfbMs'),
        };
    }

    /**
     * Check if TTFB target is met
     */
    isTTFBMet(): boolean {
        return (this.currentRun.ttfbMs || Infinity) <= config.latency.targetTTFB;
    }

    /**
     * Clear metrics
     */
    clear(): void {
        this.metrics.clear();
        this.currentRun = {};
    }
}

// Singleton instance
let latencyMonitor: LatencyMonitor | null = null;

/**
 * Get the latency monitor singleton
 */
export function getLatencyMonitor(): LatencyMonitor {
    if (!latencyMonitor) {
        latencyMonitor = new LatencyMonitor();
    }
    return latencyMonitor;
}
