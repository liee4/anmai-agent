import { expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { NotificationService } from '../../../src/features/emergency/notification-service.js';

const risk = { level: 'abnormal' as const, score: 2, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' };

it('tracks individual contacts and advances when the primary notification fails', () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const notifications = new NotificationService(db, clock);
  notifications.setDemoOutcome('w', 'primary', 'fail_always');
  const emergency = new EmergencyService(db, clock);
  const alert = emergency.start('w', risk);
  const result = emergency.act(alert.eventId, alert.stateVersion, { kind: 'wearer_unwell' });
  expect(result.event?.state).toBe('other_contacts');
  expect(notifications.list(alert.eventId)).toMatchObject([
    { contactId: 'primary', status: 'delivery_failed', attempts: 1 },
    { contactId: 'other-1', status: 'delivered', attempts: 1 },
    { contactId: 'other-2', status: 'delivered', attempts: 1 },
  ]);
  clock.advance(5_000);
  emergency.runDue();
  expect(notifications.list(alert.eventId)[0]).toMatchObject({ attempts: 2, status: 'delivery_failed' });
  db.close();
});

it('moves to simulated call if all individual contacts fail and does not duplicate on restart', () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const notifications = new NotificationService(db, clock);
  for (const id of ['primary', 'other-1', 'other-2']) notifications.setDemoOutcome('w', id, 'fail_always');
  const first = new EmergencyService(db, clock);
  const alert = first.start('w', risk);
  const result = first.act(alert.eventId, alert.stateVersion, { kind: 'wearer_unwell' });
  expect(result.event?.state).toBe('simulated_call');
  expect(notifications.list(alert.eventId)).toHaveLength(3);
  const restarted = new EmergencyService(db, clock);
  restarted.runDue();
  expect(notifications.list(alert.eventId)).toHaveLength(3);
  db.close();
});

it('records a named contact taking over exactly once', () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const emergency = new EmergencyService(db, clock);
  const alert = emergency.start('w', risk);
  const primary = emergency.act(alert.eventId, alert.stateVersion, { kind: 'wearer_unwell' }).event!;
  expect(emergency.respondContact(primary.eventId, primary.stateVersion, 'primary', 'takeover').event?.state).toBe('relative_takeover');
  expect(emergency.respondContact(primary.eventId, primary.stateVersion, 'primary', 'takeover').ok).toBe(false);
  expect(new NotificationService(db, clock).list(alert.eventId)[0]?.status).toBe('taken_over');
  db.close();
});

it('accepts a primary contact who becomes reachable after other contacts were notified', () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const notifications = new NotificationService(db, clock);
  notifications.setDemoOutcome('w', 'primary', 'fail_once');
  const emergency = new EmergencyService(db, clock);
  const alert = emergency.start('w', risk);
  const others = emergency.act(alert.eventId, alert.stateVersion, { kind: 'wearer_unwell' }).event!;
  expect(others.state).toBe('other_contacts');
  clock.advance(5_000);
  emergency.runDue();
  expect(notifications.list(alert.eventId)[0]?.status).toBe('delivered');
  expect(emergency.respondContact(others.eventId, others.stateVersion, 'primary', 'takeover').event?.state).toBe('relative_takeover');
  expect(notifications.list(alert.eventId)[0]?.status).toBe('taken_over');
  db.close();
});
