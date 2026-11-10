import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';

it('interprets wearer text without changing the emergency event until confirmation', async () => {
  const db = openDatabase(':memory:');
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')) });
  try {
    const start = await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'demo-wearer' } });
    const event = start.json().event;
    expect(event.state).toBe('wearer_alert');
    const interpretation = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/interpret-response`, payload: { text: '我没事，但胸口不舒服' } });
    expect(interpretation.statusCode).toBe(200);
    expect(interpretation.json()).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
    const unchanged = (await app.inject({ method: 'GET', url: `/api/events/${event.eventId}` })).json();
    expect(unchanged.state).toBe('wearer_alert');
    expect(unchanged.stateVersion).toBe(event.stateVersion);
    const invalid = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/interpret-response`, payload: { text: ' ' } });
    expect(invalid.statusCode).toBe(400);
    const confirmed = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/actions`, payload: { kind: 'wearer_unwell', stateVersion: event.stateVersion } });
    expect(confirmed.json().event.state).toBe('primary_contact');
    const late = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/interpret-response`, payload: { text: '我没事' } });
    expect(late.statusCode).toBe(409);
  } finally { await app.close(); db.close(); }
});

it('uses the configured text provider without letting interpretation advance the event', async () => {
  const db = openDatabase(':memory:');
  const received: string[] = [];
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')), wearerTextProviderName: 'deepseek', wearerTextProvider: { interpret: async request => { received.push(request.text); return { intent: 'unwell', suggestedAction: 'wearer_unwell', summary: '理解为身体不舒服；请确认是否立即联系亲属。' }; } } });
  try {
    const event = (await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'demo-wearer' } })).json().event;
    const response = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/interpret-response`, payload: { text: '心脏有点疼' } });
    expect(response.json()).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell', provider: 'deepseek' });
    expect(received).toEqual(['心脏有点疼']);
    expect((await app.inject({ method: 'GET', url: `/api/events/${event.eventId}` })).json().state).toBe('wearer_alert');
  } finally { await app.close(); db.close(); }
});

it('falls back to local interpretation when the text model fails', async () => {
  const db = openDatabase(':memory:');
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')), wearerTextProviderName: 'deepseek', wearerTextProvider: { interpret: async () => { throw new Error('network unavailable'); } } });
  try {
    const event = (await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'demo-wearer' } })).json().event;
    const response = await app.inject({ method: 'POST', url: `/api/events/${event.eventId}/interpret-response`, payload: { text: '心脏有点疼' } });
    expect(response.json()).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell', provider: 'local_fallback' });
    expect((await app.inject({ method: 'GET', url: `/api/events/${event.eventId}` })).json().state).toBe('wearer_alert');
  } finally { await app.close(); db.close(); }
});
