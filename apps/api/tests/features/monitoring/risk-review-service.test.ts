import { expect, it } from 'vitest';
import type { RiskAssessment, VitalSample } from '@anmai/contracts';
import { FakeClock } from '../../../src/clock.js';
import { openDatabase } from '../../../src/infra/database.js';
import { RiskReviewService } from '../../../src/features/monitoring/risk-review-service.js';
import type { RiskReviewRequest } from '../../../src/features/monitoring/risk-review-provider.js';

const abnormal: RiskAssessment = { level: 'abnormal', score: 2, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' };
const worsening: RiskAssessment = { level: 'worsening', score: 10, reasons: ['fixed_heart_rate_high'], assessedAt: '2026-11-04T00:00:00Z' };
const samples: VitalSample[] = [{ timestamp: '2026-11-04T00:00:00Z', heartRate: 110, spo2: 97, activity: 'resting' }];

it('sends evidence and recent vitals to review without location', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  let sent: RiskReviewRequest | null = null;
  const service = new RiskReviewService(db, clock, { review: async request => { sent = request; return { decision: 'ask', reason: '请确认状态' }; } }, 'fake');
  const evidence = { context: 'resting' as const, quality: { heartRate: 'valid' as const, spo2: 'missing' as const, bloodPressure: 'missing' as const }, values: { heartRate: 110 }, deviation: { heartRateHigh: 3.2 }, coverageSeconds: { heartRate: 10, spo2: 0 }, abnormalSeconds: { heartRate: 27, spo2: 0 }, trend: 'none' as const, fixedBoundary: false };
  const location = { name: 'private-home', latitude: 1, longitude: 2 };
  await service.assess('secret-wearer-id', { ...abnormal, evidence }, [{ ...samples[0]!, location }], 1, { values: { 'resting.heartRateWarningUpper': 105 } });
  expect(sent).toMatchObject({ risk: { level: 'abnormal', evidence }, latest: { heartRate: 110 }, baselineVersion: 1 });
  expect(sent!.knowledge.map(item => item.id)).toEqual(['heart-symptoms']);
  const payload = JSON.stringify(sent);
  expect(payload).not.toContain('private-home');
  db.close();
});

it('reviews an ordinary episode once, persists observation, and asks after the deadline', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  let calls = 0;
  const service = new RiskReviewService(db, clock, { review: async () => { calls++; return { decision: 'observe', reason: '等待短时复测' }; } }, 'fake', 30);
  expect((await service.assess('w', abnormal, samples, 1, {})).action).toBe('observe');
  expect(service.get('w')?.deadlineAt).toBe('2026-11-04T00:00:30.000Z');
  expect((await service.assess('w', abnormal, samples, 1, {})).action).toBe('observe');
  clock.advance(30_000);
  expect((await service.assess('w', abnormal, samples, 1, {})).action).toBe('ask');
  expect(calls).toBe(1);
  const restarted = new RiskReviewService(db, clock, { review: async () => { throw Error('must not call'); } }, 'fake', 30);
  expect((await restarted.assess('w', abnormal, samples, 1, {})).action).toBe('ask');
  db.close();
});

it('falls back to asking when there is no baseline or the provider is uncertain', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  let calls = 0;
  const service = new RiskReviewService(db, clock, { review: async () => { calls++; return { decision: 'uncertain', reason: '证据不足' }; } }, 'fake');
  expect((await service.assess('a', abnormal, samples, null, {})).action).toBe('ask');
  expect(calls).toBe(0);
  expect((await service.assess('b', abnormal, samples, 1, {})).action).toBe('ask');
  expect(service.get('b')?.fallbackReason).toBe('uncertain');
  expect(calls).toBe(1);
  db.close();
});

it('discards a delayed model result when a fixed threshold arrives', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  let release!: (value: { decision: 'observe'; reason: string }) => void;
  const service = new RiskReviewService(db, clock, { review: () => new Promise(resolve => { release = resolve; }) }, 'fake');
  const pending = service.assess('w', abnormal, samples, 1, {});
  expect((await service.assess('w', worsening, samples, 1, {})).action).toBe('ask');
  release({ decision: 'observe', reason: '迟到结果' });
  expect((await pending).action).toBe('stale');
  expect(service.get('w')?.status).toBe('cancelled');
  db.close();
});

it('lets a person configure the observation period before review and freezes that deadline while active', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const service = new RiskReviewService(db, clock, { review: async () => ({ decision: 'observe', reason: '短时观察' }) }, 'fake');
  expect(service.setObservationSeconds(12)).toBe(true);
  expect(service.getSettings()).toEqual({ observationSeconds: 12 });
  await service.assess('w', abnormal, samples, 1, {});
  expect(service.get('w')?.deadlineAt).toBe('2026-11-04T00:00:12.000Z');
  expect(service.setObservationSeconds(3)).toBe(false);
  expect(service.getSettings()).toEqual({ observationSeconds: 12 });
  db.close();
});
