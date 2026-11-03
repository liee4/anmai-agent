import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';

describe('simulator API', () => {
  it('runs normal, activity, abnormal and loose device scenarios from one route', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-10-28T10:00:00Z')) });
    for (const [scenario, level] of [['normal', 'normal'], ['activity', 'normal'], ['abnormal', 'abnormal'], ['loose_device', 'untrusted_data']] as const) {
      const response = await app.inject({ method: 'POST', url: `/api/simulator/${scenario}`, payload: { wearerId: scenario } });
      expect(response.statusCode).toBe(200);
      expect(response.json().risk.level).toBe(level);
    }
    await app.close(); db.close();
  });
});
