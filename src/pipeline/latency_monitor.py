"""
Voice AI Assistant - Latency Monitor
Tracks pipeline latency metrics for performance optimization
"""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from src.config import config


@dataclass
class PipelineMetrics:
    """Metrics for a single pipeline run"""
    asr_latency_ms: float = 0
    query_rewrite_latency_ms: float = 0
    search_latency_ms: float = 0
    rerank_latency_ms: float = 0
    llm_latency_ms: float = 0
    voice_opt_latency_ms: float = 0
    tts_latency_ms: float = 0
    total_latency_ms: float = 0
    ttfb_ms: float = 0


class LatencyMonitor:
    """Tracks latency metrics for the pipeline"""
    
    def __init__(self):
        self.metrics: Dict[str, List[PipelineMetrics]] = {}
        self.current_run: PipelineMetrics = PipelineMetrics()
        self.start_time: float = 0
        self.first_byte_time: float = 0
    
    def start_run(self, run_id: str) -> None:
        """Start tracking a new pipeline run"""
        self.current_run = PipelineMetrics()
        self.start_time = time.time()
        self.first_byte_time = 0
    
    def record_first_byte(self) -> None:
        """Record Time to First Byte"""
        if self.first_byte_time == 0:
            self.first_byte_time = time.time()
            self.current_run.ttfb_ms = (self.first_byte_time - self.start_time) * 1000
    
    def record_latency(self, component: str, latency_ms: float) -> None:
        """Record a component's latency"""
        if hasattr(self.current_run, f"{component}_latency_ms"):
            setattr(self.current_run, f"{component}_latency_ms", latency_ms)
    
    def end_run(self, run_id: str) -> PipelineMetrics:
        """End the run and store metrics"""
        self.current_run.total_latency_ms = (time.time() - self.start_time) * 1000
        
        if run_id not in self.metrics:
            self.metrics[run_id] = []
        self.metrics[run_id].append(self.current_run)
        
        # Log metrics
        self._log_metrics(self.current_run)
        
        return self.current_run
    
    def _log_metrics(self, metrics: PipelineMetrics) -> None:
        """Log metrics to console"""
        ttfb_status = '✅' if metrics.ttfb_ms <= config.latency.target_ttfb else '⚠️'
        
        print('\n📊 Pipeline Metrics:')
        print(f'   TTFB: {metrics.ttfb_ms:.0f}ms {ttfb_status} (target: <{config.latency.target_ttfb}ms)')
        print(f'   Total: {metrics.total_latency_ms:.0f}ms')
        print('   Breakdown:')
        print(f'     - ASR: {metrics.asr_latency_ms:.0f}ms')
        print(f'     - Query Rewrite: {metrics.query_rewrite_latency_ms:.0f}ms')
        print(f'     - Search: {metrics.search_latency_ms:.0f}ms')
        print(f'     - Rerank: {metrics.rerank_latency_ms:.0f}ms')
        print(f'     - LLM: {metrics.llm_latency_ms:.0f}ms')
        print(f'     - Voice Opt: {metrics.voice_opt_latency_ms:.0f}ms')
        print(f'     - TTS: {metrics.tts_latency_ms:.0f}ms')
    
    def get_average_metrics(self, run_id: str) -> Optional[PipelineMetrics]:
        """Get average metrics for a run"""
        if run_id not in self.metrics or not self.metrics[run_id]:
            return None
        
        run_metrics = self.metrics[run_id]
        n = len(run_metrics)
        
        avg = PipelineMetrics(
            asr_latency_ms=sum(m.asr_latency_ms for m in run_metrics) / n,
            query_rewrite_latency_ms=sum(m.query_rewrite_latency_ms for m in run_metrics) / n,
            search_latency_ms=sum(m.search_latency_ms for m in run_metrics) / n,
            rerank_latency_ms=sum(m.rerank_latency_ms for m in run_metrics) / n,
            llm_latency_ms=sum(m.llm_latency_ms for m in run_metrics) / n,
            voice_opt_latency_ms=sum(m.voice_opt_latency_ms for m in run_metrics) / n,
            tts_latency_ms=sum(m.tts_latency_ms for m in run_metrics) / n,
            total_latency_ms=sum(m.total_latency_ms for m in run_metrics) / n,
            ttfb_ms=sum(m.ttfb_ms for m in run_metrics) / n,
        )
        
        return avg
    
    def is_ttfb_met(self) -> bool:
        """Check if TTFB target is met"""
        return self.current_run.ttfb_ms <= config.latency.target_ttfb
    
    def clear(self) -> None:
        """Clear all metrics"""
        self.metrics.clear()
        self.current_run = PipelineMetrics()


# Global latency monitor instance
_latency_monitor: Optional[LatencyMonitor] = None


def get_latency_monitor() -> LatencyMonitor:
    """Get the global latency monitor instance"""
    global _latency_monitor
    if _latency_monitor is None:
        _latency_monitor = LatencyMonitor()
    return _latency_monitor
