import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';

it('prepares a different 14-day demo set after each completed import', async () => {
  const db = openDatabase(':memory:');
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-04T00:00:00Z')) });
  const first = await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=w' });
  expect(first.statusCode).toBe(200);
  expect(first.json().data).toHaveLength(14 * 480);
  expect(first.json().data[0]).toMatchObject({ timestamp: '2026-10-01T00:00:00.000Z', heartRate: 76 });
  const firstImport = await app.inject({ method: 'POST', url: '/api/ingest', payload: first.json() });
  expect(firstImport.json()).toMatchObject({ coveredDays: 14, duplicateSamples: 0, baselineVersion: 1 });

  const second = await app.inject({ method: 'GET', url: '/api/simulator/history/next?wearerId=w' });
  expect(second.json().data[0]).toMatchObject({ timestamp: '2026-10-15T00:00:00.000Z' });
  expect(second.json().data[0].heartRate).not.toBe(first.json().data[0].heartRate);
  const secondImport = await app.inject({ method: 'POST', url: '/api/ingest', payload: second.json() });
  expect(secondImport.json()).toMatchObject({ coveredDays: 14, duplicateSamples: 0, completedCycles: 2, baselineVersion: 2 });
  await app.close(); db.close();
});
