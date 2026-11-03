import { describe, expect, it } from 'vitest';
import { RiskDetector } from '../../../src/features/monitoring/risk-detector.js';
import type { VitalSample } from '@anmai/contracts';

const samples = (count: number, heartRate: number, spo2 = 97) => Array.from({ length: count }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate, spo2, activity: 'resting' as const }));

describe('risk detector', () => {
  const detector = new RiskDetector();

  it('treats an isolated spike as insufficient persistence', () => {
    const stream = samples(29, 78);
    stream.push({ ...samples(30, 112)[29]! });
    expect(detector.evaluate(stream).level).toBe('normal');
  });

  it('asks for a response after 24 of 30 abnormal seconds and five consecutive ending seconds', () => {
    const stream = samples(35, 112);
    expect(detector.evaluate(stream, { values: { 'resting.heartRateWarningUpper': 105 } }).level).toBe('abnormal');
  });

  it('never treats loose-device samples as a health alarm', () => {
    const stream = samples(30, 140).map(item => ({ ...item, deviceTrusted: false }));
    expect(detector.evaluate(stream).level).toBe('untrusted_data');
  });
  it('uses a softer resting warning while allowing ordinary activity', () => {
    expect(detector.evaluate(samples(35, 112)).level).toBe('abnormal');
    expect(detector.evaluate(samples(35, 112).map(sample => ({ ...sample, activity: 'activity' }))).level).toBe('normal');
  });
  it('checks a fresh fixed blood-pressure boundary immediately', () => {
    const stream: VitalSample[] = samples(30, 78);
    stream[29] = { ...stream[29]!, systolicBP: 190, diastolicBP: 110 };
    expect(detector.evaluate(stream).level).toBe('worsening');
  });
  it('does not escalate from a single fixed-threshold heart-rate spike', () => {
    const stream = samples(34, 78);
    stream.push({ ...samples(35, 135)[34]! });
    expect(detector.evaluate(stream).level).toBe('normal');
  });
  it('does not count sparse readings as thirty seconds of persistence', () => {
    const stream = samples(35, 112).map((sample, index) => ({ ...sample, timestamp: new Date(Date.UTC(2026, 9, 28, 10, index, 0)).toISOString() }));
    expect(detector.evaluate(stream).level).toBe('untrusted_data');
  });
  it('uses an approved personal warning threshold', () => {
    expect(detector.evaluate(samples(35, 112), { values: { 'resting.heartRateWarningUpper': 115 } }).level).toBe('normal');
  });
});
