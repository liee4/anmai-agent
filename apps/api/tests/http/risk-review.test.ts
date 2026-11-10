import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { BaselineRepository } from '../../src/infra/repositories/baseline-repository.js';

it('places model review between rule abnormality and the wearer question', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:35Z'));
  new BaselineRepository(db).publish({ wearerId: 'w', version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-15T00:00:00Z', baseline: { values: {}, observations: [] } });
  let calls = 0;
  const app = buildApp({ db, clock, riskReviewProvider: { review: async () => { calls++; return { decision: 'observe', reason: '短时观察' }; } }, riskReviewProviderName: 'test' });
  const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 10, 4, 0, 0, index)).toISOString(), heartRate: 110, spo2: 97, activity: 'resting' }));
  const first = await app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'w', samples } });
  expect(first.json()).toMatchObject({ risk: { level: 'abnormal' }, event: null });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json()).toMatchObject({ riskReviewProvider: 'test', riskReview: { status: 'observe', decision: 'observe' } });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json().knowledge).toMatchObject([{ id: 'heart-symptoms', version: '2026-11-10.1' }]);
  expect((await app.inject({ method: 'GET', url: '/api/knowledge' })).json().entries).toHaveLength(3);
  clock.advance(30_000);
  const expired = await app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'w', samples } });
  expect(expired.json()).toMatchObject({ event: { state: 'wearer_alert' } });
  expect(calls).toBe(1);
  await app.close(); db.close();
});

it('lets the wearer ask for relatives during observation without waiting for the model deadline', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:35Z'));
  new BaselineRepository(db).publish({ wearerId: 'w', version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-15T00:00:00Z', baseline: { values: {}, observations: [] } });
  const app = buildApp({ db, clock });
  const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 10, 4, 0, 0, index)).toISOString(), heartRate: 110, spo2: 97, activity: 'resting' }));
  await app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'w', samples } });
  const help = await app.inject({ method: 'POST', url: '/api/monitor/help', payload: { wearerId: 'w' } });
  expect(help.json()).toMatchObject({ event: { state: 'primary_contact' } });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json()).toMatchObject({ baselineState: { status: 'paused' }, riskReview: { status: 'cancelled' } });
  await app.close(); db.close();
});

it('lets the wearer request help while the model request is still pending', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:35Z'));
  new BaselineRepository(db).publish({ wearerId: 'w', version: 1, cycleId: 'w:2026-10-01', publishedAt: '2026-10-15T00:00:00Z', baseline: { values: {}, observations: [] } });
  let entered!: () => void;
  let release!: (value: { decision: 'observe'; reason: string }) => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const app = buildApp({ db, clock, riskReviewProvider: { review: () => { entered(); return new Promise(resolve => { release = resolve; }); } } });
  const samples = Array.from({ length: 35 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 10, 4, 0, 0, index)).toISOString(), heartRate: 110, spo2: 97, activity: 'resting' }));
  const evaluating = app.inject({ method: 'POST', url: '/api/monitor/evaluate', payload: { wearerId: 'w', samples } });
  await started;
  const help = await app.inject({ method: 'POST', url: '/api/monitor/help', payload: { wearerId: 'w' } });
  expect(help.json()).toMatchObject({ event: { state: 'primary_contact' } });
  release({ decision: 'observe', reason: '迟到' });
  expect((await evaluating).json()).toMatchObject({ event: { state: 'primary_contact' } });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json()).toMatchObject({ riskReview: { status: 'cancelled' } });
  await app.close(); db.close();
});
