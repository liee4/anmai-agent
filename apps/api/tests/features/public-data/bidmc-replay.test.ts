import { describe, expect, it } from 'vitest';
import { bidmcRecord, parseBidmcNumerics, replayBidmcWindow } from '../../../src/features/public-data/bidmc-replay.js';

describe('BIDMC public recording replay', () => {
  it('keeps the original record, missing values and source attribution', () => {
    expect(bidmcRecord.source.recordId).toBe('bidmc_01');
    expect(bidmcRecord.source.version).toBe('1.0.0');
    expect(bidmcRecord.rows).toHaveLength(481);
    expect(bidmcRecord.rows[0]).toEqual({ second: 0, heartRate: 94, pulseRate: 93, respiratoryRate: 25, spo2: 97 });
    expect(bidmcRecord.rows[111]).toEqual({ second: 111, heartRate: 92, respiratoryRate: 23 });
    expect(bidmcRecord.rows[124]?.spo2).toBe(98);
    expect(bidmcRecord.rows.filter(row => row.spo2 === undefined)).toHaveLength(13);
  });

  it('rejects a malformed source file instead of silently inventing measurements', () => {
    expect(() => parseBidmcNumerics('Time [s], HR, PULSE, RESP, SpO2\n0,94,93,25,97\n2,94,93,25,97')).toThrow(/time sequence/i);
    expect(() => parseBidmcNumerics('Time [s], HR, PULSE, RESP, SpO2\n0,garbage,93,25,97')).toThrow(/invalid HR/i);
  });

  it('maps only measured HR and SpO2 into a 35 second simulation window', () => {
    const replay = replayBidmcWindow(100, new Date('2026-11-10T10:00:00Z'));
    expect(replay.source).toEqual(bidmcRecord.source);
    expect(replay.rows).toHaveLength(35);
    expect(replay.rows[0]?.second).toBe(100);
    expect(replay.rows.at(-1)?.second).toBe(134);
    expect(replay.samples[0]).toEqual({ timestamp: '2026-11-10T09:59:26.000Z', heartRate: 93, spo2: 97, activity: 'unknown' });
    expect(replay.samples[11]).toEqual({ timestamp: '2026-11-10T09:59:37.000Z', heartRate: 92, activity: 'unknown' });
    expect(replay.samples.every(sample => !('systolicBP' in sample) && !('location' in sample))).toBe(true);
    expect(() => replayBidmcWindow(447, new Date())).toThrow(/startSecond/i);
  });
});
