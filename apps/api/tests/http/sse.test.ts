import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { FakeClock } from '../../src/clock.js';
import { buildApp } from '../../src/app.js';

describe('SSE monitoring stream', () => {
  it('sends a snapshot and keeps another wearer out of the live stream', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ db, clock: new FakeClock(new Date('2026-10-28T10:00:00Z')) });
    const controller = new AbortController();
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(`${address}/api/events/stream?wearerId=w`, { signal: controller.signal });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const first = decoder.decode((await reader.read()).value);
      expect(first).toContain('event: snapshot');
      await app.inject({ method: 'POST', url: '/api/simulator/normal', payload: { wearerId: 'other' } });
      await app.inject({ method: 'POST', url: '/api/simulator/abnormal', payload: { wearerId: 'w' } });
      const next = decoder.decode((await reader.read()).value);
      expect(next).toContain('"wearerId":"w"');
      expect(next).not.toContain('"wearerId":"other"');
    } finally {
      controller.abort();
      await app.close();
      db.close();
    }
  });
});
