import { describe, expect, it } from 'vitest';
import { buildObservationBaseline } from '../../../src/features/baseline/observation-baseline.js';

describe('observation baseline', () => {
  it('computes robust statistics only from eligible readings', () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({ context: 'resting' as const, heartRate: [60, 70, 80, 90, 100][Math.floor(index / 12)]!, spo2: 97, baselineEligible: true, minuteAt: new Date(Date.UTC(2026, 9, 28, 10, index)).toISOString() }));
    samples.push({ context: 'resting', heartRate: 190, spo2: 80, baselineEligible: false, minuteAt: '2026-10-28T11:00:00Z' });
    const result = buildObservationBaseline(samples);
    expect(result.resting?.heartRate).toMatchObject({ median: 80, p10: 60, p90: 100, mad: 10, sampleCount: 60 });
    expect(result.resting?.spo2?.median).toBe(97);
  });

  it('does not create a context with less than one hour of samples', () => {
    const samples = Array.from({ length: 59 }, (_, index) => ({ context: 'night' as const, heartRate: 65, baselineEligible: true, minuteAt: new Date(Date.UTC(2026, 9, 28, 0, index)).toISOString() }));
    expect(buildObservationBaseline(samples).night).toBeUndefined();
  });
});
