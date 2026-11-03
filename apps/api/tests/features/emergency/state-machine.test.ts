import { describe, expect, it } from 'vitest';
import { createEvent, reduceEmergencyState } from '../../../src/features/emergency/state-machine.js';

const settings = { wearerResponseSeconds: 60, primaryRelativeSeconds: 30, otherRelativesSeconds: 30, safeRecheckSeconds: 300 };
const now = new Date('2026-10-28T10:00:00Z');
const risk = { level: 'abnormal' as const, score: 5, reasons: ['heart_rate'], assessedAt: now.toISOString() };

describe('emergency state machine', () => {
  it('alerts the wearer before contacting relatives', () => {
    const event = createEvent('event-1', 'wearer-1', risk, settings, now);
    expect(event).toMatchObject({ state: 'wearer_alert', stateVersion: 1, deadlineAt: '2026-10-28T10:01:00.000Z' });
  });

  it('contacts the primary relative immediately when the wearer says unwell', () => {
    const event = createEvent('event-1', 'wearer-1', risk, settings, now);
    expect(reduceEmergencyState(event, { kind: 'wearer_unwell' }, now)).toMatchObject({ state: 'primary_contact', deadlineAt: '2026-10-28T10:00:30.000Z' });
  });

  it('closes the event after a safe response while background monitoring continues separately', () => {
    const event = createEvent('event-1', 'wearer-1', risk, settings, now);
    const safe = reduceEmergencyState(event, { kind: 'wearer_safe' }, now);
    expect(safe).toMatchObject({ state: 'closed', deadlineAt: null });
    expect(reduceEmergencyState(safe, { kind: 'worsening' }, now)).toEqual(safe);
  });

  it('escalates to others and then a simulated call when nobody takes over', () => {
    const event = createEvent('event-1', 'wearer-1', risk, settings, now);
    const primary = reduceEmergencyState(event, { kind: 'deadline' }, new Date('2026-10-28T10:01:00Z'));
    const others = reduceEmergencyState(primary, { kind: 'deadline' }, new Date('2026-10-28T10:01:30Z'));
    const call = reduceEmergencyState(others, { kind: 'deadline' }, new Date('2026-10-28T10:02:00Z'));
    expect([primary.state, others.state, call.state]).toEqual(['primary_contact', 'other_contacts', 'simulated_call']);
    expect(reduceEmergencyState(others, { kind: 'relative_decline' }, now).state).toBe('simulated_call');
  });
});
