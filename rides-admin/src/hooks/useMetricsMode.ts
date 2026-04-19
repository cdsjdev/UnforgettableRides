import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsSummary } from '@shared/types';

type MetricsMode = 'tracked' | 'legacy';

export function useMetricsMode(summary?: AnalyticsSummary | null) {
  const [useTrackedMetrics, setUseTrackedMetrics] = useState(true);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const preferredMode = summary?.metrics_default === 'legacy' ? 'legacy' : 'tracked';

  useEffect(() => {
    if (defaultApplied) return;
    if (!summary) return;
    setUseTrackedMetrics(preferredMode === 'tracked');
    setDefaultApplied(true);
  }, [defaultApplied, preferredMode, summary]);

  return useMemo(() => {
    const trackedMetricsAvailable = Boolean(
      summary
      && typeof summary.tracked_entries === 'number'
      && typeof summary.tracked_exits === 'number'
    );
    const metricsMode: MetricsMode = (useTrackedMetrics && trackedMetricsAvailable) ? 'tracked' : 'legacy';
    const entriesTodayCount = metricsMode === 'tracked'
      ? (summary?.tracked_entries ?? 0)
      : (summary?.total_entries ?? 0);
    const exitsTodayCount = metricsMode === 'tracked'
      ? (summary?.tracked_exits ?? 0)
      : (summary?.total_exits ?? 0);

    return {
      metricsMode,
      trackedMetricsAvailable,
      entriesTodayCount,
      exitsTodayCount,
      setUseTrackedMetrics,
    };
  }, [summary, useTrackedMetrics]);
}
