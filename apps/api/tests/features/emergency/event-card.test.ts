import { expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { EventCardService } from '../../../src/features/emergency/event-card-service.js';

it('builds a card from observed values and leaves unknown personal details unregistered', () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const emergency = new EmergencyService(db, clock);
  const event = emergency.start('w', { level: 'abnormal', score: 2, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' });
  const cards = new EventCardService(db);
  cards.record(event.eventId, [{ timestamp: '2026-11-04T00:00:00Z', heartRate: 104, spo2: 97, activity: 'resting' }, { timestamp: '2026-11-04T00:00:30Z', heartRate: 112, spo2: 96, activity: 'resting' }]);
  expect(cards.get(event.eventId)).toMatchObject({ name: null, age: null, medicalHistory: null, allergies: null, wearerFeedback: '未回应', latest: { heartRate: 112, spo2: 96 }, trend: { heartRateDelta: 8, spo2Delta: -1 } });
  emergency.act(event.eventId, event.stateVersion, { kind: 'wearer_unwell' });
  expect(cards.get(event.eventId)?.wearerFeedback).toBe('表示不舒服，需要亲属');
  db.close();
});
