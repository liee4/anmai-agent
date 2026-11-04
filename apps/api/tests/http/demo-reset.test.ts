import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { FakeBaselineProvider } from '../../src/features/baseline/fake-baseline-provider.js';

const resetPayload = { wearerId: 'demo-wearer', confirmation: 'RESET_DEMO_DATA' };

it('resets only the demo wearer and restarts its baseline sequence at v1', async () => {
  const db = openDatabase(':memory:');
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-04T10:00:00Z')) });
  const history = (await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=demo-wearer' })).json();
  expect((await app.inject({ method: 'POST', url: '/api/ingest', payload: history })).json().baselineVersion).toBe(1);
  await app.inject({ method: 'POST', url: '/api/ingest', payload: { inputMode: 'auto', wearerId: 'other-wearer', data: [{ timestamp: '2026-10-01T00:00:00Z', heartRate: 76, spo2: 97, activity: 'resting' }] } });
  const alert = (await app.inject({ method: 'POST', url: '/api/simulator/worsening', payload: { wearerId: 'demo-wearer' } })).json().event;
  await app.inject({ method: 'POST', url: `/api/events/${alert.eventId}/actions`, payload: { stateVersion: alert.stateVersion, kind: 'wearer_unwell' } });

  expect((await app.inject({ method: 'POST', url: '/api/simulator/reset', payload: { wearerId: 'demo-wearer' } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: '/api/simulator/reset', payload: { wearerId: 'other-wearer', confirmation: 'RESET_DEMO_DATA' } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/demo-wearer' })).json().baseline.version).toBe(1);
  expect((await app.inject({ method: 'POST', url: '/api/simulator/reset', payload: resetPayload })).json()).toEqual({ reset: true });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/demo-wearer' })).json()).toMatchObject({ baseline: null, event: null, risk: null, baselineState: { status: 'active' } });
  for (const table of ['ingested_samples', 'minute_vitals', 'daily_summaries', 'baseline_state', 'baseline_versions', 'baseline_attempts', 'baseline_exclusions', 'emergency_events', 'wearer_monitor_state']) {
    expect(db.raw.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE wearer_id = ?`).get('demo-wearer')).toMatchObject({ count: 0 });
  }
  expect(db.raw.prepare('SELECT COUNT(*) AS count FROM event_timeline WHERE event_id = ?').get(alert.eventId)).toMatchObject({ count: 0 });
  expect(db.raw.prepare('SELECT COUNT(*) AS count FROM simulated_deliveries WHERE event_id = ?').get(alert.eventId)).toMatchObject({ count: 0 });
  expect(db.raw.prepare('SELECT COUNT(*) AS count FROM ingested_samples WHERE wearer_id = ?').get('other-wearer')).toMatchObject({ count: 1 });
  expect((await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=demo-wearer' })).json().data[0].timestamp).toBe('2026-10-01T00:00:00.000Z');
  expect((await app.inject({ method: 'POST', url: '/api/ingest', payload: history })).json().baselineVersion).toBe(1);
  await app.close(); db.close();
});

it('does not publish a delayed model result after reset', async () => {
  const db = openDatabase(':memory:');
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const fake = new FakeBaselineProvider();
  const provider = { generateCandidate: async (...args: Parameters<FakeBaselineProvider['generateCandidate']>) => { entered(); await gate; return fake.generateCandidate(...args); } };
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-04T10:00:00Z')), baselineProvider: provider });
  const history = (await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=demo-wearer' })).json();
  const importing = app.inject({ method: 'POST', url: '/api/ingest', payload: history });
  await started;
  expect((await app.inject({ method: 'POST', url: '/api/simulator/reset', payload: resetPayload })).statusCode).toBe(200);
  release();
  await importing;
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/demo-wearer' })).json().baseline).toBeNull();
  expect(db.raw.prepare('SELECT COUNT(*) AS count FROM baseline_attempts WHERE wearer_id = ?').get('demo-wearer')).toMatchObject({ count: 0 });
  await app.close(); db.close();
});
