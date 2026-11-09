import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { nextDemoHistory } from '../../src/features/simulator/demo-history.js';

it('keeps the displayed vital pattern distinct across the first six demo cycles', () => {
  const dates: string[] = [];
  const signatures = new Set<string>();
  for (let cycle = 0; cycle < 6; cycle++) {
    const history = nextDemoHistory('w', dates);
    const first = history.data[0];
    const activity = history.data[120];
    expect(first).toBeDefined();
    expect(activity).toBeDefined();
    const signature = `${first!.heartRate}:${activity!.heartRate}:${first!.spo2}`;
    expect(signatures.has(signature)).toBe(false);
    signatures.add(signature);
    for (let day = 0; day < 14; day++) dates.push(history.data[day * 480]!.timestamp.slice(0, 10));
  }
});

it('prepares a different 14-day demo set after each completed import', async () => {
  const db = openDatabase(':memory:');
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-04T00:00:00Z')) });
  const first = await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=w' });
  expect(first.statusCode).toBe(200);
  expect(first.json().data).toHaveLength(14 * 480);
  expect(first.json().data[0]).toMatchObject({ timestamp: '2026-10-01T00:00:00.000Z', heartRate: 76 });
  const firstImport = await app.inject({ method: 'POST', url: '/api/ingest', payload: first.json() });
  expect(firstImport.json()).toMatchObject({ coveredDays: 14, duplicateSamples: 0, baselineVersion: 1 });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json()).toMatchObject({ aggregationWarning: false, baseline: { baseline: { aggregationVersion: 2 } } });
  const activity = await app.inject({ method: 'POST', url: '/api/simulator/activity', payload: { wearerId: 'w' } });
  expect(activity.json().risk.level).toBe('normal');

  const second = await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=w' });
  expect(second.json().data[0]).toMatchObject({ timestamp: '2026-10-15T00:00:00.000Z' });
  expect(second.json().data[0].heartRate).not.toBe(first.json().data[0].heartRate);
  const secondImport = await app.inject({ method: 'POST', url: '/api/ingest', payload: second.json() });
  expect(secondImport.json()).toMatchObject({ coveredDays: 14, duplicateSamples: 0, completedCycles: 2, baselineVersion: 2 });
  expect((await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json().baselineHistory).toMatchObject([{ version: 2 }, { version: 1 }]);
  for (let version = 3; version <= 6; version++) {
    const next = (await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=w' })).json();
    expect((await app.inject({ method: 'POST', url: '/api/ingest', payload: next })).json().baselineVersion).toBe(version);
  }
  const latestBaseline = (await app.inject({ method: 'GET', url: '/api/dashboard/w' })).json().baseline;
  const normalAfterSix = (await app.inject({ method: 'POST', url: '/api/simulator/normal', payload: { wearerId: 'w' } })).json();
  expect(normalAfterSix.risk.level).toBe('normal');
  expect(normalAfterSix.demoInput.heartRate).toBe(Math.round(latestBaseline.baseline.observations.find((item: { context: string }) => item.context === 'resting').heartRate.median));
  expect((await app.inject({ method: 'POST', url: '/api/simulator/activity', payload: { wearerId: 'w' } })).json().risk.level).toBe('normal');
  await app.close(); db.close();
}, 15_000);
