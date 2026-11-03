import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { DailySummaryRepository } from '../../src/infra/repositories/daily-summary-repository.js';
import { BaselineRepository } from '../../src/infra/repositories/baseline-repository.js';

const start = new Date('2026-10-28T10:00:00Z');
const reading = (timestamp: string, heartRate = 112) => ({ timestamp, heartRate, spo2: 97, activity: 'resting' });

describe('baseline exclusion after risk assessment', () => {
  it('excludes soft abnormal monitoring data imported after the assessment', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(start) });
    const assessed = await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    expect(assessed.json().risk.level).toBe('abnormal');

    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data: [reading('2026-10-28T09:59:45Z')] } });
    expect(db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ?').get('w')).toMatchObject({ baseline_eligible: 0, exclusion_reasons_json: '["risk_abnormal"]' });
    await app.close(); db.close();
  });

  it('retroactively excludes imported readings when monitoring later judges them abnormal', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(start) });
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data: [reading('2026-10-28T09:59:45Z')] } });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ?').get('w')).toMatchObject({ baseline_eligible: 1 });

    await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    expect(db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ?').get('w')).toMatchObject({ baseline_eligible: 0, exclusion_reasons_json: '["risk_abnormal"]' });
    await app.close(); db.close();
  });

  it('excludes the interval between alert and an unwell response even after learning resumes', async () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(start);
    const app = buildApp({ db, clock });
    const alert = await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    const event = alert.json().event;
    clock.advance(120_000);
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data: [reading('2026-10-28T10:01:30Z', 78)] } });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ? AND minute_at = ?').get('w', '2026-10-28T10:01:00Z')).toMatchObject({ baseline_eligible: 1 });

    const unwell = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { stateVersion: event.stateVersion, kind: 'wearer_unwell' } });
    expect(unwell.json().ok).toBe(true);
    expect(db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ? AND minute_at = ?').get('w', '2026-10-28T10:01:00Z')).toMatchObject({ baseline_eligible: 0, exclusion_reasons_json: '["wearer_unwell"]' });
    const contact = unwell.json().event;
    await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { stateVersion: contact.stateVersion, kind: 'close' } });
    await app.inject({ method: 'POST', url: '/api/baselines/w/resume' });
    expect(db.raw.prepare('SELECT baseline_eligible FROM minute_vitals WHERE wearer_id = ? AND minute_at = ?').get('w', '2026-10-28T10:01:00Z')).toMatchObject({ baseline_eligible: 0 });
    await app.close(); db.close();
  });

  it('does not count a day as valid when exclusions leave less than eight hours of learnable data', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(start) });
    const data = Array.from({ length: 480 }, (_, index) => reading(new Date(Date.UTC(2026, 9, 28, 3, index)).toISOString(), 78)).map((item, index) => ({ ...item, activity: index < 120 ? 'resting' : 'activity' }));
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data } });
    expect(new DailySummaryRepository(db).get('w', '2026-10-28')?.baselineEligible).toBe(true);

    await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    expect(new DailySummaryRepository(db).get('w', '2026-10-28')?.baselineEligible).toBe(false);
    await app.close(); db.close();
  });

  it('withdraws a published baseline that already used newly excluded data', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(start) });
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data: [reading('2026-10-28T09:59:45Z')] } });
    const baselines = new BaselineRepository(db);
    baselines.publish({ wearerId: 'w', version: 1, cycleId: 'w:2026-10-15', publishedAt: '2026-10-28T09:59:00Z', baseline: { values: { 'resting.heartRateWarningUpper': 100 } } });
    expect(baselines.getActive('w')?.version).toBe(1);

    await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    expect(baselines.getActive('w')).toBeNull();
    expect(db.raw.prepare('SELECT invalidated_at FROM baseline_versions WHERE wearer_id = ? AND version = 1').get('w')).toMatchObject({ invalidated_at: expect.any(String) });
    await app.close(); db.close();
  });

  it('retains every applicable exclusion reason for a later import', async () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(start);
    const app = buildApp({ db, clock });
    const alert = await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
    clock.advance(60_000);
    const event = alert.json().event;
    await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { stateVersion: event.stateVersion, kind: 'wearer_unwell' } });
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'w', data: [reading('2026-10-28T10:00:00Z')] } });
    const row = db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ?').get('w') as { baseline_eligible: number; exclusion_reasons_json: string };
    expect(row.baseline_eligible).toBe(0);
    expect(JSON.parse(row.exclusion_reasons_json)).toEqual(expect.arrayContaining(['baseline_paused', 'risk_abnormal', 'wearer_unwell']));
    await app.close(); db.close();
  });
});
