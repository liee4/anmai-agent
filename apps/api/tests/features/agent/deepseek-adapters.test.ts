import { expect, it, vi } from 'vitest';
import { DeepSeekMessageProvider } from '../../../src/features/agent/deepseek-message-provider.js';
import { DeepSeekRiskReviewProvider } from '../../../src/features/monitoring/deepseek-risk-review-provider.js';
import { fallbackMessages } from '../../../src/features/agent/message-provider.js';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';

const options = (content: string) => ({ apiKey: 'test-only', baseUrl: 'https://example.test', model: 'test-model', fetcher: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) });

it('accepts a strict risk decision and rejects an extra field from DeepSeek', async () => {
  const request = { risk: { level: 'abnormal', score: 2, reasons: [], assessedAt: '2026-11-04T00:00:00Z' }, latest: { timestamp: '2026-11-04T00:00:00Z', heartRate: 108, spo2: 97, activity: 'resting', deviceTrusted: true }, recent: [], baselineVersion: 1, baseline: {} } as Parameters<DeepSeekRiskReviewProvider['review']>[0];
  const valid = options('{"decision":"observe","reason":"短时复查"}');
  expect(await new DeepSeekRiskReviewProvider(valid).review(request)).toEqual({ decision: 'observe', reason: '短时复查' });
  expect(valid.fetcher.mock.calls).toHaveLength(1);
  const invalid = options('{"decision":"observe","reason":"短时复查","callRelative":true}');
  await expect(new DeepSeekRiskReviewProvider(invalid).review(request)).rejects.toThrow('schema mismatch');
});

it('restricts generated message fields to the current event stage', async () => {
  const db = openDatabase(':memory:');
  try {
    const event = new EmergencyService(db, new FakeClock(new Date('2026-11-04T00:00:00Z'))).start('w', { level: 'abnormal', score: 2, reasons: [], assessedAt: '2026-11-04T00:00:00Z' });
    const fallback = fallbackMessages(event);
    const valid = options('{"wearerPrompt":"请确认您现在的状态。"}');
    expect(await new DeepSeekMessageProvider(valid).compose({ event, fallback })).toEqual({ wearerPrompt: '请确认您现在的状态。' });
    const invalid = options('{"wearerPrompt":"请确认您现在的状态。","emergencyScript":"拨打急救电话"}');
    await expect(new DeepSeekMessageProvider(invalid).compose({ event, fallback })).rejects.toThrow('Invalid message fields');
  } finally { db.close(); }
});
