import type { VitalSample } from '@anmai/contracts';
import { median } from './sliding-window.js';
import { demoThresholds } from './detection-config.js';

export interface SecondVital {
  at: number;
  heartRate: number;
  spo2: number;
}

/** One observation per elapsed second, regardless of device sampling rate. */
export function secondVitals(samples: VitalSample[], usable: (sample: VitalSample) => boolean): SecondVital[] {
  const bySecond = new Map<number, VitalSample[]>();
  const timestamps = new Set<string>();
  for (const sample of samples) {
    if (!usable(sample) || timestamps.has(sample.timestamp)) continue;
    timestamps.add(sample.timestamp);
    const at = Math.floor(Date.parse(sample.timestamp) / 1000) * 1000;
    if (!Number.isFinite(at)) continue;
    const bucket = bySecond.get(at) ?? [];
    bucket.push(sample);
    bySecond.set(at, bucket);
  }
  return [...bySecond.entries()].filter(([, bucket]) => {
    const heartRates = bucket.map(sample => sample.heartRate!);
    const oxygen = bucket.map(sample => sample.spo2!);
    return Math.max(...heartRates) - Math.min(...heartRates) <= demoThresholds.maxWithinSecondHeartRateRange && Math.max(...oxygen) - Math.min(...oxygen) <= demoThresholds.maxWithinSecondSpo2Range;
  }).sort(([a], [b]) => a - b).map(([at, bucket]) => ({
    at,
    heartRate: median(bucket.map(sample => sample.heartRate!))!,
    spo2: median(bucket.map(sample => sample.spo2!))!,
  }));
}
