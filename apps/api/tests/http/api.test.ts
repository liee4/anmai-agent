import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';

describe('local demo API', () => {
  it('accepts one JSON input route and exposes an emergency response flow', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-10-28T10:00:00Z')) });
    const ingested = await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'wearer-1', data: [{ timestamp: '2026-10-28T10:00:00Z', heartRate: 78, spo2: 97, activity: 'resting' }] } });
    expect(ingested.statusCode).toBe(200);
    expect(ingested.json()).toMatchObject({ detectedMode: 'daily', coveredDays: 1 });
    const alerted = await app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'wearer-1', samples: Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' })) } });
    expect(alerted.statusCode).toBe(200);
    expect(alerted.json()).toMatchObject({ risk: { level: 'abnormal' }, event: { state: 'wearer_alert' } });
    const event = alerted.json().event;
    const repeated = await app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'wearer-1', samples: Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 9, 28, 10, 0, index)).toISOString(), heartRate: 112, spo2: 97, activity: 'resting' })) } });
    expect(repeated.json().event.eventId).toBe(event.eventId);
    const timerChange = await app.inject({ method: 'PUT', url: '/api/settings/timers', payload: { wearerResponseSeconds: 10, primaryRelativeSeconds: 5, otherRelativesSeconds: 5, safeRecheckSeconds: 20 } });
    expect(timerChange.statusCode).toBe(409);
    const response = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { stateVersion: event.stateVersion, kind: 'wearer_unwell' } });
    expect(response.json()).toMatchObject({ ok: true, event: { state: 'primary_contact' } });
    const timeline = await app.inject({ method: 'GET', url: `/api/events/${event.eventId}/timeline` });
    expect(timeline.json().length).toBe(3);
    expect(timeline.json().map((entry: { kind: string }) => entry.kind)).toContain('relative_notification');
    expect((db.raw.prepare('SELECT status FROM baseline_state WHERE wearer_id = ?').get('wearer-1') as { status: string }).status).toBe('paused');
    const baseline = await app.inject({ method: 'GET', url: '/api/baselines/wearer-1' });
    expect(baseline.json()).toMatchObject({ state: { status: 'paused' }, provider: 'fake' });
    const deniedResume = await app.inject({ method: 'POST', url: '/api/baselines/wearer-1/resume' });
    expect(deniedResume.statusCode).toBe(409);
    const closed = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { stateVersion: response.json().event.stateVersion, kind: 'close' } });
    expect(closed.json()).toMatchObject({ ok: true, event: { state: 'closed' } });
    const resumed = await app.inject({ method: 'POST', url: '/api/baselines/wearer-1/resume' });
    expect(resumed.json()).toMatchObject({ resumed: true });
    const settings = await app.inject({ method: 'PUT', url: '/api/settings/timers', payload: { wearerResponseSeconds: 10, primaryRelativeSeconds: 5, otherRelativesSeconds: 5, safeRecheckSeconds: 20 } });
    expect(settings.json()).toMatchObject({ wearerResponseSeconds: 10 });
    await app.close(); db.close();
  });
});
