import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { FakeClock } from '../../../src/clock.js';

const risk = { level: 'abnormal' as const, score: 5, reasons: ['heart_rate'], assessedAt: '2026-10-28T10:00:00Z' };

describe('emergency persistence', () => {
  it('does not escalate a confirmed ordinary anomaly because of a legacy score change', () => {
    const db = openDatabase(':memory:');
    const service = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const event = service.start('wearer-1', risk);
    service.act(event.eventId, event.stateVersion, { kind: 'wearer_safe' });
    expect(service.observeRisk('wearer-1', { ...risk, score: 99 })).toBe('suppress');
    expect(service.observeRisk('wearer-1', { level: 'worsening', reasons: ['clear_worsening_trend'], assessedAt: risk.assessedAt })).toBe('worsening');
    db.close();
  });
  it('rejects stale wearer responses and retains the winning state', () => {
    const db = openDatabase(':memory:');
    const service = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const event = service.start('wearer-1', risk);
    const first = service.act(event.eventId, event.stateVersion, { kind: 'wearer_unwell' });
    const stale = service.act(event.eventId, event.stateVersion, { kind: 'wearer_safe' });
    expect(first).toMatchObject({ ok: true, event: { state: 'primary_contact', stateVersion: 2 } });
    expect(stale).toMatchObject({ ok: false, event: { state: 'primary_contact', stateVersion: 2 } });
    db.close();
  });

  it('restores and executes overdue deadlines once', () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const first = new EmergencyService(db, clock);
    const event = first.start('wearer-1', risk);
    clock.advance(61_000);
    const restarted = new EmergencyService(db, clock);
    expect(restarted.runDue()).toBe(1);
    expect(restarted.runDue()).toBe(0);
    expect(restarted.get(event.eventId)?.state).toBe('primary_contact');
    db.close();
  });
  it('closes a wearer alert after ten seconds of normal data', () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const service = new EmergencyService(db, clock);
    const event = service.start('wearer-1', risk);
    const normal = { ...risk, level: 'normal' as const, score: 0, reasons: [] };
    expect(service.observeActiveRisk(event, normal).state).toBe('wearer_alert');
    clock.advance(10_000);
    expect(service.observeActiveRisk(event, normal).state).toBe('closed');
    expect(service.getActiveForWearer('wearer-1')).toBeNull();
    db.close();
  });
  it('does not contact relatives when the latest risk is normal at the response deadline', () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const service = new EmergencyService(db, clock);
    const event = service.start('wearer-1', risk);
    service.observeActiveRisk(event, { ...risk, level: 'normal', score: 0, reasons: [] });
    clock.advance(61_000);
    expect(service.runDue()).toBe(1);
    expect(service.get(event.eventId)?.state).toBe('closed');
    db.close();
  });
  it('accepts a late safe response during contact only before worsening or an unwell response', () => {
    const db = openDatabase(':memory:');
    const service = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const first = service.start('wearer-1', risk);
    const contact = service.act(first.eventId, first.stateVersion, { kind: 'deadline' }).event!;
    expect(service.act(contact.eventId, contact.stateVersion, { kind: 'wearer_safe' }).event?.state).toBe('closed');
    const second = service.start('wearer-1', risk);
    const unwell = service.act(second.eventId, second.stateVersion, { kind: 'wearer_unwell' }).event!;
    expect(service.act(unwell.eventId, unwell.stateVersion, { kind: 'wearer_safe' }).ok).toBe(false);
    db.close();
  });
  it('records each simulated contact and call once with a stable idempotency key', () => {
    const db = openDatabase(':memory:');
    const service = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const alerted = service.start('wearer-1', risk);
    const primary = service.act(alerted.eventId, alerted.stateVersion, { kind: 'wearer_unwell' }).event!;
    expect(service.act(alerted.eventId, alerted.stateVersion, { kind: 'wearer_unwell' }).ok).toBe(false);
    const others = service.act(primary.eventId, primary.stateVersion, { kind: 'relative_decline' }).event!;
    const call = service.act(others.eventId, others.stateVersion, { kind: 'relative_decline' }).event!;
    expect(call.state).toBe('simulated_call');
    const rows = db.raw.prepare('SELECT recipient, status FROM simulated_deliveries ORDER BY created_at, rowid').all() as { recipient: string; status: string }[];
    expect(rows).toEqual([{ recipient: 'primary-relative', status: 'declined' }, { recipient: 'other-relatives', status: 'declined' }, { recipient: 'emergency-simulator', status: 'delivered' }]);
    db.close();
  });
});
