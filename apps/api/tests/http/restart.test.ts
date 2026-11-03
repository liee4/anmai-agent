import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/infra/database.js';
import { FakeClock } from '../../src/clock.js';
import { buildApp } from '../../src/app.js';

describe('restart recovery', () => {
  it('restores a persisted wearer deadline and delivers the next stage once', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'anmai-restart-'));
    const path = join(directory, 'events.sqlite');
    const clock = new FakeClock(new Date('2026-10-28T10:00:00Z'));
    try {
      const firstDb = openDatabase(path);
      const firstApp = buildApp({ db: firstDb, clock });
      const alert = await firstApp.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
      const eventId = alert.json().event.eventId as string;
      await firstApp.close();
      firstDb.close();

      clock.advance(61_000);
      const reopenedDb = openDatabase(path);
      const reopenedApp = buildApp({ db: reopenedDb, clock });
      expect((await reopenedApp.inject({ method: 'POST', url: '/api/deadlines/run' })).json().executed).toBe(1);
      expect((await reopenedApp.inject({ method: 'POST', url: '/api/deadlines/run' })).json().executed).toBe(0);
      expect((await reopenedApp.inject({ method: 'GET', url: `/api/events/${eventId}` })).json().state).toBe('primary_contact');
      expect((reopenedDb.raw.prepare('SELECT COUNT(*) AS count FROM simulated_deliveries WHERE event_id = ?').get(eventId) as { count: number }).count).toBe(1);
      await reopenedApp.close();
      reopenedDb.close();
    } finally {
      for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
      rmdirSync(directory);
    }
  });
});
