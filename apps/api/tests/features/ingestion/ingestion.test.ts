import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { IngestionService } from '../../../src/features/ingestion/ingestion-service.js';
import { DailySummaryRepository } from '../../../src/infra/repositories/daily-summary-repository.js';
import { BaselineRepository } from '../../../src/infra/repositories/baseline-repository.js';

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
  it('stores a minute median instead of the first sample in that minute', () => {
    const db = openDatabase(':memory:');
    new IngestionService(db).ingest({ inputMode: 'auto', wearerId: 'w', data: [
      { ...sample('2026-10-28T10:30:01Z'), heartRate: 70 },
      { ...sample('2026-10-28T10:30:02Z'), heartRate: 80 },
      { ...sample('2026-10-28T10:30:03Z'), heartRate: 90 },
    ] });
    expect(db.raw.prepare('SELECT heart_rate, sample_count FROM minute_vitals WHERE wearer_id = ?').get('w')).toMatchObject({ heart_rate: 80, sample_count: 3 });
    db.close();
  });

  it('excludes and audits a sustained historical soft anomaly against an existing baseline without raising a live alert', () => {
    const db = openDatabase(':memory:');
    const wearerId = 'w';
    new BaselineRepository(db).publish({ wearerId, version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-28T00:00:00Z', baseline: { values: { 'resting.heartRateWarningUpper': 105 } } });
    const start = Date.parse('2026-10-28T10:00:00Z');
    const abnormal = Array.from({ length: 35 }, (_, index) => ({ ...sample(new Date(start + index * 1000).toISOString()), heartRate: 112 }));
    const input = { inputMode: 'auto' as const, wearerId, data: [...abnormal, sample('2026-10-29T10:00:00Z')] };

    const service = new IngestionService(db);
    expect(service.ingest(input).detectedMode).toBe('historical');
    expect(db.raw.prepare("SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ? AND minute_at = '2026-10-28T10:00:00Z'").get(wearerId)).toMatchObject({ baseline_eligible: 0 });
    expect(db.raw.prepare("SELECT reason FROM baseline_exclusions WHERE wearer_id = ?").all(wearerId)).toEqual([{ reason: 'risk_abnormal' }]);
    const auditCount = (db.raw.prepare("SELECT COUNT(*) AS count FROM risk_sample_audit WHERE wearer_id = ? AND reason = 'risk_abnormal'").get(wearerId) as { count: number }).count;
    expect(auditCount).toBeGreaterThan(0);
    expect(service.ingest(input).duplicateSamples).toBe(input.data.length);
    expect(db.raw.prepare("SELECT COUNT(*) AS count FROM risk_sample_audit WHERE wearer_id = ? AND reason = 'risk_abnormal'").get(wearerId)).toMatchObject({ count: auditCount });
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM emergency_events').get()).toMatchObject({ count: 0 });
    db.close();
  });

  it('finds a sustained soft anomaly across two daily imports', () => {
    const db = openDatabase(':memory:');
    const wearerId = 'w';
    new BaselineRepository(db).publish({ wearerId, version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-28T00:00:00Z', baseline: { values: { 'resting.heartRateWarningUpper': 105 } } });
    const start = Date.parse('2026-10-28T10:00:00Z');
    const data = Array.from({ length: 40 }, (_, index) => ({ ...sample(new Date(start + index * 1000).toISOString()), heartRate: 112 }));
    const service = new IngestionService(db);
    service.ingest({ inputMode: 'daily', wearerId, data: data.slice(0, 20) });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ?').get(wearerId)).toMatchObject({ baseline_eligible: 1 });
    service.ingest({ inputMode: 'daily', wearerId, data: data.slice(20) });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ?').get(wearerId)).toMatchObject({ baseline_eligible: 0 });
    db.close();
  });

  it('keeps non-acute historical variation available for first-time personalization', () => {
    const db = openDatabase(':memory:');
    const start = Date.parse('2026-10-28T10:00:00Z');
    const data = Array.from({ length: 35 }, (_, index) => ({ ...sample(new Date(start + index * 1000).toISOString()), heartRate: 112 }));
    new IngestionService(db).ingest({ inputMode: 'daily', wearerId: 'w', data });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ?').get('w')).toMatchObject({ baseline_eligible: 1 });
    db.close();
  });

  it('rolls back an imported batch if risk auditing fails', () => {
    const db = openDatabase(':memory:');
    new BaselineRepository(db).publish({ wearerId: 'w', version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-28T00:00:00Z', baseline: { values: { 'resting.heartRateWarningUpper': 105 } } });
    db.raw.exec("CREATE TRIGGER reject_risk_audit BEFORE INSERT ON risk_sample_audit BEGIN SELECT RAISE(ABORT, 'audit write failed'); END");
    const start = Date.parse('2026-10-28T10:00:00Z');
    const data = Array.from({ length: 35 }, (_, index) => ({ ...sample(new Date(start + index * 1000).toISOString()), heartRate: 112 }));
    expect(() => new IngestionService(db).ingest({ inputMode: 'daily', wearerId: 'w', data })).toThrow('audit write failed');
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM ingested_samples WHERE wearer_id = ?').get('w')).toMatchObject({ count: 0 });
    db.close();
  });
});
