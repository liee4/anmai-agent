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
  it('keeps two mild persistent channels ordinary without a worsening trend', () => {
    const stream = samples(35, 110, 93);
    expect(detector.evaluate(stream)).toMatchObject({
      level: 'abnormal',
      reasons: expect.arrayContaining(['heart_rate_persistent', 'spo2_persistent']),
    });
  });

  it('evaluates a persistent heart-rate anomaly when SpO2 is unavailable', () => {
    const result = detector.evaluate(samples(35, 112).map(({ spo2: _spo2, ...sample }) => sample));
    expect(result.level).toBe('abnormal');
    expect(result.evidence?.quality.spo2).toBe('missing');
    expect(result).not.toHaveProperty('score');
  });

  it('evaluates a fixed heart-rate boundary without SpO2', () => {
    const result = detector.evaluate(samples(35, 140).map(({ spo2: _spo2, ...sample }) => sample));
    expect(result.level).toBe('worsening');
  });

  it('does not treat oxygen above its personal baseline as an anomaly', () => {
    const result = detector.evaluate(samples(35, 78, 97), { observations: [{ context: 'resting', spo2: { median: 94, mad: 0.2 } }] });
    expect(result.level).toBe('normal');
  });

  it('detects a clear worsening trend after sustained heart-rate abnormality', () => {
    const stream = [...samples(30, 108), ...samples(40, 118).slice(30)];
    expect(detector.evaluate(stream).level).toBe('worsening');
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

  it('does not turn 870 ms of dense abnormal readings into 24 abnormal seconds', () => {
    const start = Date.UTC(2026, 9, 28, 10, 0, 0);
    const oldNormal = Array.from({ length: 5 }, (_, index) => ({ timestamp: new Date(start + index * 100).toISOString(), heartRate: 78, spo2: 97, activity: 'resting' as const }));
    const denseAbnormal = Array.from({ length: 30 }, (_, index) => ({ timestamp: new Date(start + 29_000 + index * 30).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' as const }));
    expect(detector.evaluate([...oldNormal, ...denseAbnormal]).level).toBe('untrusted_data');
  });

  it('requires the final five distinct seconds to be abnormal', () => {
    const stream = samples(35, 112).filter((_, index) => index !== 33);
    expect(detector.evaluate(stream).level).toBe('normal');
  });

  it('does not treat one second of dense fixed-threshold readings as a stable value', () => {
    const start = Date.UTC(2026, 9, 28, 10, 0, 0);
    const dense = Array.from({ length: 10 }, (_, index) => ({ timestamp: new Date(start + index * 80).toISOString(), heartRate: 140, spo2: 90, activity: 'resting' as const }));
    expect(detector.evaluate(dense).level).toBe('untrusted_data');
  });

  it('treats a large gap in the recent sampling cadence as untrusted', () => {
    const stream = samples(10, 140).filter((_, index) => [0, 1, 2, 8, 9].includes(index));
    expect(detector.evaluate(stream).level).toBe('untrusted_data');
  });

  it('isolates contradictory heart rates without discarding valid oxygen', () => {
    const stream = samples(5, 78);
    stream.push({ ...stream[4]!, timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, 4, 500)).toISOString(), heartRate: 220 });
    expect(detector.evaluate(stream)).toMatchObject({ level: 'normal', evidence: { quality: { heartRate: 'suspect', spo2: 'valid' } } });
  });

  it('rejects conflicting values at the exact same timestamp', () => {
    const stream = samples(35, 125);
    stream.push({ ...stream[34]!, heartRate: 110 });
    expect(detector.evaluate(stream)).toMatchObject({ level: 'normal', evidence: { quality: { heartRate: 'suspect', spo2: 'valid' } } });
  });

  it('does not use a fixed heart-rate boundary while a recent second conflicts', () => {
    const stream = samples(35, 140);
    stream.push({ ...stream[30]!, timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, 30, 500)).toISOString(), heartRate: 60 });
    expect(detector.evaluate(stream)).toMatchObject({ level: 'normal', evidence: { quality: { heartRate: 'suspect', spo2: 'valid' } } });
  });

  it('rejects an implausible blood-pressure pair before checking fixed boundaries', () => {
    const stream: VitalSample[] = samples(35, 78);
    stream[34] = { ...stream[34]!, systolicBP: 1, diastolicBP: 0 };
    expect(detector.evaluate(stream)).toMatchObject({ level: 'normal', evidence: { quality: { bloodPressure: 'suspect' } } });
  });

  it('uses valid readings without a known activity context for fixed boundaries only', () => {
    const normal = samples(35, 78).map(sample => ({ ...sample, activity: 'unknown' as const }));
    expect(detector.evaluate(normal).level).toBe('normal');
    const fixed = samples(35, 140).map(sample => ({ ...sample, activity: 'unknown' as const }));
    expect(detector.evaluate(fixed).level).toBe('worsening');
  });

  it('rejects a recent fixed-boundary reading after a five-second leading gap', () => {
    const stream = [...samples(25, 78), ...samples(35, 140).slice(30)];
    expect(detector.evaluate(stream).level).toBe('untrusted_data');
  });

  it('does not mistake an old invalid stream for a newly started device', () => {
    const stream = [...samples(25, 300), ...samples(35, 140).slice(30)].map(({ spo2: _spo2, ...sample }) => sample);
    expect(detector.evaluate(stream).level).toBe('untrusted_data');
  });
});
