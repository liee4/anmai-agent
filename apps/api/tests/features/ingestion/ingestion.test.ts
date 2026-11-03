import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { IngestionService } from '../../../src/features/ingestion/ingestion-service.js';
import { DailySummaryRepository } from '../../../src/infra/repositories/daily-summary-repository.js';

const sample = (timestamp: string) => ({ timestamp, heartRate: 78, spo2: 97, activity: 'resting' as const });

describe('unified ingestion', () => {
  it('routes a single day to the daily adapter and deduplicates reuploads', () => {
    const db = openDatabase(':memory:');
    const service = new IngestionService(db);
    const input = { inputMode: 'auto' as const, wearerId: 'wearer-1', data: [sample('2026-10-28T10:30:05+08:00')] };
    expect(service.ingest(input)).toMatchObject({ detectedMode: 'daily', coveredDays: 1, duplicateSamples: 0 });
    expect(service.ingest(input)).toMatchObject({ detectedMode: 'daily', coveredDays: 1, duplicateSamples: 1 });
    db.close();
  });

  it('routes two days through the historical adapter and persists both summaries', () => {
    const db = openDatabase(':memory:');
    const service = new IngestionService(db);
    const result = service.ingest({ inputMode: 'auto', wearerId: 'wearer-1', data: [sample('2026-10-29T10:30:05+08:00'), sample('2026-10-28T10:30:05+08:00')] });
    expect(result).toMatchObject({ detectedMode: 'historical', coveredDays: 2 });
    expect(new DailySummaryRepository(db).list('wearer-1').map(day => day.date)).toEqual(['2026-10-28', '2026-10-29']);
    db.close();
  });

  it('does not save any day if one timestamp is invalid', () => {
    const db = openDatabase(':memory:');
    const service = new IngestionService(db);
    expect(() => service.ingest({ inputMode: 'auto', wearerId: 'wearer-1', data: [sample('2026-10-28T10:30:05+08:00'), sample('not-a-date')] })).toThrow(/timestamp/);
    expect(new DailySummaryRepository(db).list('wearer-1')).toHaveLength(0);
    db.close();
  });

  it("uses the wearer's local day when UTC falls on the previous date", () => {
    const db = openDatabase(':memory:');
    new IngestionService(db).ingest({ inputMode: 'auto', wearerId: 'wearer-1', data: [sample('2026-10-28T00:30:05+08:00')] });
    const day = new DailySummaryRepository(db).get('wearer-1', '2026-10-28');
    expect(day?.coverageHours).toBeCloseTo(1 / 60);
    expect(day?.qualityRate).toBe(1);
    expect((db.raw.prepare('SELECT local_date FROM minute_vitals').get() as { local_date: string }).local_date).toBe('2026-10-28');
    db.close();
  });
  it('excludes an acute abnormal sample from baseline learning', () => {
    const db = openDatabase(':memory:');
    new IngestionService(db).ingest({ inputMode: 'auto', wearerId: 'wearer-1', data: [{ ...sample('2026-10-28T10:30:05+08:00'), heartRate: 135 }] });
    expect(db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals').get()).toMatchObject({ baseline_eligible: 0, exclusion_reasons_json: '["acute_anomaly"]' });
    db.close();
  });
  it('stores monitoring samples but excludes them from learning while paused', () => {
    const db = openDatabase(':memory:');
    db.raw.prepare("INSERT INTO baseline_state(wearer_id,status,paused_at,pause_reason) VALUES ('wearer-1','paused','2026-10-28T00:00:00Z','wearer_unwell')").run();
    new IngestionService(db).ingest({ inputMode: 'auto', wearerId: 'wearer-1', data: [sample('2026-10-28T10:30:05+08:00')] });
    expect(new DailySummaryRepository(db).get('wearer-1', '2026-10-28')).toMatchObject({ baselineEligible: false, exclusionReasons: ['baseline_paused'] });
    expect((db.raw.prepare('SELECT baseline_eligible FROM minute_vitals').get() as { baseline_eligible: number }).baseline_eligible).toBe(0);
    db.close();
  });
});
