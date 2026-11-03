import { describe, expect, it } from 'vitest';
import { parseIngestRequest } from './index.js';

const sample = (timestamp: string) => ({
  timestamp,
  heartRate: 78,
  spo2: 97,
  systolicBP: 126,
  diastolicBP: 78,
  activity: 'resting',
  location: { name: '示例社区', latitude: 0, longitude: 0 },
});

describe('ingest contract', () => {
  it('accepts a single natural day', () => {
    const request = parseIngestRequest({ inputMode: 'auto', wearerId: 'wearer-001', data: [sample('2026-10-28T10:30:05+08:00')] });
    expect(request.data).toHaveLength(1);
  });

  it('accepts multiple natural days through the same entry', () => {
    const request = parseIngestRequest({ inputMode: 'auto', wearerId: 'wearer-001', data: [sample('2026-10-28T10:30:05+08:00'), sample('2026-10-29T10:30:05+08:00')] });
    expect(request.data).toHaveLength(2);
  });

  it('rejects malformed timestamps', () => {
    expect(() => parseIngestRequest({ inputMode: 'auto', wearerId: 'wearer-001', data: [sample('yesterday')] })).toThrow(/timestamp/);
  });

  it('rejects an impossible blood pressure pair', () => {
    expect(() => parseIngestRequest({ inputMode: 'auto', wearerId: 'wearer-001', data: [{ ...sample('2026-10-28T10:30:05+08:00'), systolicBP: 70, diastolicBP: 80 }] })).toThrow(/blood pressure/);
  });

  it('rejects unknown fields', () => {
    expect(() => parseIngestRequest({ inputMode: 'auto', wearerId: 'wearer-001', data: [{ ...sample('2026-10-28T10:30:05+08:00'), diagnosis: 'healthy' }] })).toThrow(/Unexpected property/);
  });
});
