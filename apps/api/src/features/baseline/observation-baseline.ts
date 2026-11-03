import type { Context, Metric, ObservationBaseline } from '@anmai/contracts';

export interface BaselineReading {
  minuteAt: string;
  context: Context;
  baselineEligible: boolean;
  heartRate?: number;
  spo2?: number;
  systolicBP?: number;
  diastolicBP?: number;
}

const metrics: Metric[] = ['heartRate', 'spo2', 'systolicBP', 'diastolicBP'];
const contexts: Context[] = ['resting', 'activity', 'night'];

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function statistics(values: number[]) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const deviations = sorted.map(value => Math.abs(value - median)).sort((a, b) => a - b);
  return { median, p10: percentile(sorted, 0.1), p90: percentile(sorted, 0.9), mad: percentile(deviations, 0.5), sampleCount: sorted.length };
}

export function buildObservationBaseline(readings: BaselineReading[]): Partial<Record<Context, ObservationBaseline>> {
  const result: Partial<Record<Context, ObservationBaseline>> = {};
  for (const context of contexts) {
    const selected = readings.filter(reading => reading.baselineEligible && reading.context === context);
    const minutes = new Set(selected.map(reading => reading.minuteAt));
    if (minutes.size < 60) continue;
    const baseline: ObservationBaseline = { context, hours: minutes.size / 60 };
    for (const metric of metrics) {
      const values = selected.map(reading => reading[metric]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const stats = statistics(values);
      if (stats) baseline[metric] = stats;
    }
    result[context] = baseline;
  }
  return result;
}
