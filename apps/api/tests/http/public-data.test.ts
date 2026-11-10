import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';

describe('public recorded data replay API', () => {
  it('assesses the recorded values without adding them to baseline history', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/public-data/bidmc/01/replay', payload: { wearerId: 'demo-wearer', startSecond: 100 } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.source.recordId).toBe('bidmc_01');
      expect(body.rows).toHaveLength(35);
      expect(body.rows[11]).toEqual({ second: 111, heartRate: 92, respiratoryRate: 23 });
      expect(body.risk.evidence.context).toBe('unknown');
      expect(body.risk.reasons).toContain('activity_unknown');
      expect(body.event).toBeNull();
      const stored = db.raw.prepare('SELECT COUNT(*) AS count FROM ingested_samples WHERE wearer_id = ?').get('demo-wearer') as { count: number };
      expect(stored.count).toBe(0);
      expect((await app.inject({ method: 'GET', url: '/api/baselines/demo-wearer' })).json().active).toBeNull();
    } finally { await app.close(); db.close(); }
  });

  it('rejects an out-of-range window', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/public-data/bidmc/01/replay', payload: { wearerId: 'demo-wearer', startSecond: 447 } });
      expect(response.statusCode).toBe(400);
    } finally { await app.close(); db.close(); }
  });

  it.each([
    ['21', 'fixed_heart_rate_high'],
    ['32', 'fixed_spo2_low'],
  ])('runs a genuine BIDMC %s abnormal window through the emergency flow', async (recordId, reason) => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-10T10:00:00Z')) });
    try {
      const response = await app.inject({ method: 'POST', url: `/api/public-data/bidmc/${recordId}/replay`, payload: { wearerId: 'demo-wearer', startSecond: 100 } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.source.recordId).toBe(`bidmc_${recordId}`);
      expect(body.risk).toMatchObject({ level: 'worsening', reasons: [reason], evidence: { context: 'unknown', fixedBoundary: true } });
      expect(body.event).toMatchObject({ state: 'primary_contact' });
      expect((db.raw.prepare('SELECT COUNT(*) AS count FROM ingested_samples').get() as { count: number }).count).toBe(0);
    } finally { await app.close(); db.close(); }
  });
});
