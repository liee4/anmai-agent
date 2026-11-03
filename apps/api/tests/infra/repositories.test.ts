import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { EmergencyRepository } from '../../src/infra/repositories/emergency-repository.js';
import { DailySummaryRepository } from '../../src/infra/repositories/daily-summary-repository.js';
import { DeadlineRepository } from '../../src/infra/repositories/deadline-repository.js';
import { BaselineRepository } from '../../src/infra/repositories/baseline-repository.js';

describe('repositories', () => {
  it('updates an emergency event only at the expected state version', () => {
    const db = openDatabase(':memory:');
    const events = new EmergencyRepository(db);
    events.create({ eventId: 'event-1', wearerId: 'wearer-1', state: 'wearer_alert', stateVersion: 1, createdAt: '2026-10-28T00:00:00Z', deadlineAt: '2026-10-28T00:01:00Z', timerSettings: { wearerResponseSeconds: 60, primaryRelativeSeconds: 30, otherRelativesSeconds: 30, safeRecheckSeconds: 300 }, baselineVersion: null, location: null, risk: { level: 'abnormal', score: 5, reasons: ['heart_rate'], assessedAt: '2026-10-28T00:00:00Z' } });
    expect(events.transition('event-1', 1, 'primary_contact', '2026-10-28T00:01:30Z')).toMatchObject({ ok: true, event: { stateVersion: 2, state: 'primary_contact' } });
    expect(events.transition('event-1', 1, 'closed', null)).toMatchObject({ ok: false, event: { stateVersion: 2, state: 'primary_contact' } });
    db.close();
  });

  it('saves one daily summary per wearer and date', () => {
    const db = openDatabase(':memory:');
    const days = new DailySummaryRepository(db);
    const summary = { wearerId: 'wearer-1', date: '2026-10-28', coverageHours: 8, qualityRate: 0.9, restingHours: 2, baselineEligible: true, exclusionReasons: [] } as const;
    days.upsert({ ...summary, exclusionReasons: [...summary.exclusionReasons] });
    expect(days.get('wearer-1', '2026-10-28')).toEqual(summary);
    db.close();
  });

  it('lists due deadlines and does not claim one twice', () => {
    const db = openDatabase(':memory:');
    const events = new EmergencyRepository(db);
    events.create({ eventId: 'event-2', wearerId: 'wearer-1', state: 'wearer_alert', stateVersion: 1, createdAt: '2026-10-28T00:00:00Z', deadlineAt: '2026-10-28T00:01:00Z', timerSettings: { wearerResponseSeconds: 60, primaryRelativeSeconds: 30, otherRelativesSeconds: 30, safeRecheckSeconds: 300 }, baselineVersion: null, location: null, risk: { level: 'abnormal', score: 5, reasons: [], assessedAt: '2026-10-28T00:00:00Z' } });
    const deadlines = new DeadlineRepository(db);
    deadlines.schedule({ id: 'deadline-1', eventId: 'event-2', kind: 'wearer_timeout', dueAt: '2026-10-28T00:01:00Z' });
    expect(deadlines.listDue('2026-10-28T00:00:59Z')).toHaveLength(0);
    expect(deadlines.listDue('2026-10-28T00:01:00Z')).toHaveLength(1);
    expect(deadlines.claim('deadline-1')).toBe(true);
    expect(deadlines.claim('deadline-1')).toBe(false);
    db.close();
  });

  it('retains the active baseline version', () => {
    const db = openDatabase(':memory:');
    const baselines = new BaselineRepository(db);
    baselines.publish({ wearerId: 'wearer-1', version: 1, cycleId: 'cycle-1', publishedAt: '2026-10-28T00:00:00Z', baseline: { resting: { heartRateWarningUpper: 108 } } });
    expect(baselines.getActive('wearer-1')).toMatchObject({ version: 1, baseline: { resting: { heartRateWarningUpper: 108 } } });
    db.close();
  });
});

