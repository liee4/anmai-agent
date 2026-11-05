import { describe, expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { RiskDetector } from '../../../src/features/monitoring/risk-detector.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { AnmaiAgent } from '../../../src/features/agent/anmai-agent.js';
import { ToolRegistry } from '../../../src/features/agent/tool-registry.js';

describe('agent tool boundary', () => {
  it('rejects duplicate tools, invalid input and unauthorized calls', async () => {
    const registry = new ToolRegistry();
    registry.register('contact', Type.Object({ eventId: Type.String() }), async () => 'sent', () => false);
    expect(() => registry.register('contact', Type.Object({}), async () => 'sent')).toThrow('Duplicate');
    await expect(registry.execute('missing', {}, {})).rejects.toThrow('Unknown');
    await expect(registry.execute('contact', {}, {})).rejects.toThrow('Invalid');
    await expect(registry.execute('contact', { eventId: 'event-1' }, {})).rejects.toThrow('Not authorized');
  });

  it('records a bounded observe-assess-act-observe trace for an abnormal input', async () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const agent = new AnmaiAgent(new RiskDetector(), new EmergencyService(db, clock));
    const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' as const }));
    const result = await agent.handle({ kind: 'vitals', wearerId: 'w', samples });
    expect(result.risk?.level).toBe('abnormal');
    expect(result.event?.state).toBe('wearer_alert');
    expect(result.trace).toEqual(['observe:vitals', 'assess:risk', 'decide:wearer_alert', 'act:create_alert', 'observe:event']);
    db.close();
  });
  it('overrides a safe response when subsequent data worsens', async () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const agent = new AnmaiAgent(new RiskDetector(), new EmergencyService(db, clock));
    const samples = (heartRate: number, spo2: number) => Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate, spo2, activity: 'resting' as const }));
    const alerted = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(112, 97) });
    const safe = await agent.handle({ kind: 'response', eventId: alerted.event!.eventId, stateVersion: alerted.event!.stateVersion, command: { kind: 'wearer_safe' } });
    expect(safe.event?.state).toBe('closed');
    const worsened = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(142, 90) });
    expect(worsened.event?.state).toBe('primary_contact');
    expect(worsened.event?.eventId).not.toBe(safe.event?.eventId);
    db.close();
  });
  it('warns the wearer and contacts the primary relative on first worsening', async () => {
    const db = openDatabase(':memory:');
    const emergency = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const agent = new AnmaiAgent(new RiskDetector(), emergency);
    const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 142, spo2: 90, activity: 'resting' as const }));
    const result = await agent.handle({ kind: 'vitals', wearerId: 'w', samples });
    expect(result.event?.state).toBe('primary_contact');
    expect(emergency.getTimeline(result.event!.eventId).map(item => item.kind)).toEqual(['wearer_alert', 'worsening', 'relative_notification']);
    db.close();
  });
  it('contacts other relatives immediately when an active primary-contact event worsens', async () => {
    const db = openDatabase(':memory:');
    const emergency = new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z')));
    const agent = new AnmaiAgent(new RiskDetector(), emergency);
    const samples = (heartRate: number, spo2: number) => Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate, spo2, activity: 'resting' as const }));
    const alert = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(112, 97) });
    const primary = await agent.handle({ kind: 'response', eventId: alert.event!.eventId, stateVersion: alert.event!.stateVersion, command: { kind: 'wearer_unwell' } });
    expect(primary.event?.state).toBe('primary_contact');
    const worsened = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(142, 90) });
    expect(worsened.event?.state).toBe('other_contacts');
    const repeated = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(142, 90) });
    expect(repeated.event?.state).toBe('other_contacts');
    expect(emergency.getTimeline(worsened.event!.eventId).filter(item => item.kind === 'relative_notification')).toHaveLength(2);
    expect(emergency.getTimeline(worsened.event!.eventId).some(item => item.kind === 'risk_worsened' && item.detail.includes('fixed_heart_rate_high'))).toBe(true);
    db.close();
  });
  it('notifies other relatives when a new fixed boundary is hit during primary contact', async () => {
    const db = openDatabase(':memory:');
    const agent = new AnmaiAgent(new RiskDetector(), new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z'))));
    const samples = (spo2: number) => Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 142, spo2, activity: 'resting' as const }));
    const first = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(97) });
    expect(first.event?.state).toBe('primary_contact');
    const second = await agent.handle({ kind: 'vitals', wearerId: 'w', samples: samples(90) });
    expect(second.event?.state).toBe('other_contacts');
    db.close();
  });
  it('suppresses a confirmed anomaly and offers one recheck after five minutes', async () => {
    const db = openDatabase(':memory:');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    const agent = new AnmaiAgent(new RiskDetector(), new EmergencyService(db, clock));
    const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' as const }));
    const first = await agent.handle({ kind: 'vitals', wearerId: 'w', samples });
    await agent.handle({ kind: 'response', eventId: first.event!.eventId, stateVersion: first.event!.stateVersion, command: { kind: 'wearer_safe' } });
    expect((await agent.handle({ kind: 'vitals', wearerId: 'w', samples })).event).toBeNull();
    clock.advance(300_000);
    const recheck = await agent.handle({ kind: 'vitals', wearerId: 'w', samples });
    expect(recheck.event?.state).toBe('wearer_alert');
    await agent.handle({ kind: 'response', eventId: recheck.event!.eventId, stateVersion: recheck.event!.stateVersion, command: { kind: 'wearer_safe' } });
    clock.advance(300_000);
    expect((await agent.handle({ kind: 'vitals', wearerId: 'w', samples })).event).toBeNull();
    db.close();
  });
  it('keeps the baseline threshold captured when an event started', async () => {
    const db = openDatabase(':memory:');
    const agent = new AnmaiAgent(new RiskDetector(), new EmergencyService(db, new FakeClock(new Date('2026-10-28T10:00:00Z'))));
    const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' as const }));
    const first = await agent.handle({ kind: 'vitals', wearerId: 'w', samples, baselineVersion: 1, baseline: { values: { 'resting.heartRateWarningUpper': 105 } } });
    const updated = await agent.handle({ kind: 'vitals', wearerId: 'w', samples, baselineVersion: 2, baseline: { values: { 'resting.heartRateWarningUpper': 115 } } });
    expect(first.risk?.level).toBe('abnormal');
    expect(updated.risk?.level).toBe('abnormal');
    expect(updated.event?.baselineVersion).toBe(1);
    db.close();
  });
});
