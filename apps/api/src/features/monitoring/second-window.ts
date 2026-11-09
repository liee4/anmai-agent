import type { VitalSample } from '@anmai/contracts';
import { median } from './sliding-window.js';
import { demoThresholds } from './detection-config.js';

export interface MetricSecond { at: number; value: number }

export function conflictingSeconds(samples: VitalSample[], metric: 'heartRate' | 'spo2'): Set<number> {
  const values = new Map<number, number[]>();
  const conflicts = new Set<number>();
  const byTimestamp = new Map<string, number>();
  const maxRange = metric === 'heartRate' ? demoThresholds.maxWithinSecondHeartRateRange : demoThresholds.maxWithinSecondSpo2Range;
  for (const sample of samples) {
    const value = sample[metric];
    if (value === undefined) continue;
    const at = Math.floor(Date.parse(sample.timestamp) / 1000) * 1000;
    if (!Number.isFinite(at)) continue;
    if (sample.deviceTrusted === false || !Number.isFinite(value) || (metric === 'heartRate' ? value < 30 || value > 240 : value < 70 || value > 100)) {
      conflicts.add(at);
      continue;
    }
    const previous = byTimestamp.get(sample.timestamp);
    if (previous !== undefined && previous !== value) conflicts.add(at);
    byTimestamp.set(sample.timestamp, value);
    const bucket = values.get(at) ?? [];
    bucket.push(value);
    values.set(at, bucket);
  }
  for (const [at, bucket] of values) if (Math.max(...bucket) - Math.min(...bucket) > maxRange) conflicts.add(at);
  return conflicts;
}

/** One observation per elapsed second, regardless of device sampling rate. */
export function metricSeconds(samples: VitalSample[], metric: 'heartRate' | 'spo2'): MetricSecond[] {
  const bySecond = new Map<number, VitalSample[]>();
  const timestamps = new Set<string>();
  for (const sample of samples) {
    const value = sample[metric];
    if (sample.deviceTrusted === false || value === undefined || !Number.isFinite(value) ||
      (metric === 'heartRate' ? value < 30 || value > 240 : value < 70 || value > 100) ||
      timestamps.has(sample.timestamp)) continue;
    timestamps.add(sample.timestamp);
    const at = Math.floor(Date.parse(sample.timestamp) / 1000) * 1000;
    if (!Number.isFinite(at)) continue;
    const bucket = bySecond.get(at) ?? [];
    bucket.push(sample);
    bySecond.set(at, bucket);
  }
  return [...bySecond.entries()].filter(([, bucket]) => {
    const values = bucket.map(sample => sample[metric]!);
    return Math.max(...values) - Math.min(...values) <= (metric === 'heartRate' ? demoThresholds.maxWithinSecondHeartRateRange : demoThresholds.maxWithinSecondSpo2Range);
  }).sort(([a], [b]) => a - b).map(([at, bucket]) => ({
    at,
    value: median(bucket.map(sample => sample[metric]!))!,
  }));
}
