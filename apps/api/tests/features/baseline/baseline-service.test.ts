import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { DailySummaryRepository } from '../../../src/infra/repositories/daily-summary-repository.js';
import { BaselineService } from '../../../src/features/baseline/baseline-service.js';
import { FakeBaselineProvider } from '../../../src/features/baseline/fake-baseline-provider.js';
import { BaselineRepository } from '../../../src/infra/repositories/baseline-repository.js';

describe('baseline cycle service', () => {
  it('uses accumulated local days once and publishes one validated version', async () => {
    const db = openDatabase(':memory:');
    const summaries = new DailySummaryRepository(db);
    for (let day = 0; day < 14; day++) {
      const date = new Date(Date.UTC(2026, 9, day + 1)).toISOString().slice(0, 10);
      summaries.upsert({ wearerId: 'w', date, coverageHours: 8, qualityRate: 1, restingHours: 2, baselineEligible: true, exclusionReasons: [] });
      for (let minute = 0; minute < 60; minute++) {
        const instant = new Date(Date.UTC(2026, 9, day + 1, 1, minute)).toISOString();
        db.raw.prepare('INSERT INTO minute_vitals(wearer_id, minute_at, context, heart_rate, spo2, systolic_bp, diastolic_bp, sample_count, baseline_eligible, exclusion_reasons_json, local_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('w', instant, 'resting', 76 + day % 3, 97, 130, 80, 1, 1, '[]', date);
      }
    }
    const service = new BaselineService(db, new FakeBaselineProvider());
    const first = await service.generatePending('w');
    expect(first.modelCalls).toBe(1);
    expect(first.baselineVersion).toBe(1);
    expect(service.getActive('w')?.baseline.observations).toHaveLength(1);
    const again = await service.generatePending('w');
    expect(again.modelCalls).toBe(0);
    expect(again.baselineVersion).toBe(1);
    db.close();
  });

  it('does not learn while paused', async () => {
    const db = openDatabase(':memory:');
    db.raw.prepare("INSERT INTO baseline_state(wearer_id,status,paused_at,pause_reason) VALUES ('w','paused','2026-10-01T00:00:00Z','wearer_unwell')").run();
    const service = new BaselineService(db, new FakeBaselineProvider());
    expect(await service.generatePending('w')).toMatchObject({ modelCalls: 0, baselineVersion: null });
    db.close();
  });
  it('folds the oldest of four previous versions into the long-term memory', async () => {
    const db = openDatabase(':memory:');
    const baselines = new BaselineRepository(db);
    for (let version = 1; version <= 4; version++) baselines.publish({ wearerId: 'w', version, cycleId: `old-${version}`, publishedAt: `2026-0${version}-01T00:00:00Z`, baseline: { values: { 'resting.heartRateWarningUpper': 95 } } });
    const summaries = new DailySummaryRepository(db);
    for (let day = 0; day < 14; day++) {
      const date = new Date(Date.UTC(2026, 9, day + 1)).toISOString().slice(0, 10);
      summaries.upsert({ wearerId: 'w', date, coverageHours: 8, qualityRate: 1, restingHours: 2, baselineEligible: true, exclusionReasons: [] });
      for (let minute = 0; minute < 60; minute++) db.raw.prepare('INSERT INTO minute_vitals(wearer_id, minute_at, context, heart_rate, spo2, systolic_bp, diastolic_bp, sample_count, baseline_eligible, exclusion_reasons_json, local_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('w', new Date(Date.UTC(2026, 9, day + 1, 1, minute)).toISOString(), 'resting', 76, 97, null, null, 1, 1, '[]', date);
    }
    const result = await new BaselineService(db, new FakeBaselineProvider()).generatePending('w');
    expect(result.baselineVersion).toBe(5);
    expect(baselines.getActive('w')?.baseline).toMatchObject({ evidenceWeights: { current: 0.6, longTerm: 0.1 }, longTermContributors: [1] });
    db.close();
  });
});
