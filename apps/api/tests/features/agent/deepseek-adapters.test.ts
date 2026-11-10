import { expect, it, vi } from 'vitest';
import { DeepSeekMessageProvider } from '../../../src/features/agent/deepseek-message-provider.js';
import { DeepSeekRiskReviewProvider } from '../../../src/features/monitoring/deepseek-risk-review-provider.js';
import { DeepSeekWearerTextProvider } from '../../../src/features/emergency/deepseek-wearer-text-provider.js';
import { fallbackMessages } from '../../../src/features/agent/message-provider.js';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { knowledgeForRisk } from '../../../src/features/knowledge/evidence-library.js';

const options = (content: string) => ({ apiKey: 'test-only', baseUrl: 'https://example.test', model: 'test-model', fetcher: vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) });

it('accepts a strict risk decision and rejects an extra field from DeepSeek', async () => {
  const request = { wearerId: 'secret-wearer-id', risk: { level: 'abnormal', score: 99, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' }, latest: { timestamp: '2026-11-04T00:00:00Z', heartRate: 108, spo2: 97, activity: 'resting', deviceTrusted: true }, recent: [], baselineVersion: 1, baseline: {}, knowledge: knowledgeForRisk({ level: 'abnormal', reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' }) } as Parameters<DeepSeekRiskReviewProvider['review']>[0];
  const valid = options('{"decision":"observe","reason":"短时复查"}');
  expect(await new DeepSeekRiskReviewProvider(valid).review(request)).toEqual({ decision: 'observe', reason: '短时复查' });
  expect(valid.fetcher.mock.calls).toHaveLength(1);
  const outbound = (valid.fetcher.mock.calls[0]![1] as RequestInit).body as string;
  expect(outbound).not.toContain('secret-wearer-id');
  const reviewContent = JSON.parse((JSON.parse(outbound) as { messages: { content: string }[] }).messages[1]!.content) as Record<string, unknown>;
  expect(reviewContent.risk).not.toHaveProperty('score');
  expect(reviewContent.knowledge).toMatchObject([{ id: 'heart-symptoms', sourcePublisher: '国家卫生健康委员会' }]);
  const invalid = options('{"decision":"observe","reason":"短时复查","callRelative":true}');
  await expect(new DeepSeekRiskReviewProvider(invalid).review(request)).rejects.toThrow('schema mismatch');
});

it('restricts generated message fields to the current event stage', async () => {
  const db = openDatabase(':memory:');
  try {
    const event = new EmergencyService(db, new FakeClock(new Date('2026-11-04T00:00:00Z'))).start('w', { level: 'abnormal', score: 2, reasons: [], assessedAt: '2026-11-04T00:00:00Z' }, null, { name: 'private-home', latitude: 1, longitude: 2 });
    const fallback = fallbackMessages(event);
    const valid = options('{"wearerPrompt":"请确认您现在的状态。"}');
    expect(await new DeepSeekMessageProvider(valid).compose({ event, fallback })).toEqual({ wearerPrompt: '请确认您现在的状态。' });
    const messageBody = valid.fetcher.mock.calls[0]![1]?.body as string;
    const messageContent = JSON.parse((JSON.parse(messageBody) as { messages: { content: string }[] }).messages[1]!.content) as Record<string, unknown>;
    expect(messageContent.risk).not.toHaveProperty('score');
    expect(messageContent).not.toHaveProperty('locationName');
    const invalid = options('{"wearerPrompt":"请确认您现在的状态。","emergencyScript":"拨打急救电话"}');
    await expect(new DeepSeekMessageProvider(invalid).compose({ event, fallback })).rejects.toThrow('Invalid message fields');
  } finally { db.close(); }
});

it('interprets wearer text with DeepSeek while retaining a local discomfort guard', async () => {
  const request = { wearerId: 'secret-wearer-id', text: '心脏有点疼', risk: { level: 'abnormal' as const, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-10T10:00:00Z' } };
  const valid = options('{"intent":"unwell"}');
  expect(await new DeepSeekWearerTextProvider(valid).interpret(request)).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  const outbound = valid.fetcher.mock.calls[0]![1]?.body as string;
  expect(outbound).not.toContain('secret-wearer-id');
  expect(outbound).toContain('心脏有点疼');
  const unsafe = options('{"intent":"safe"}');
  expect(await new DeepSeekWearerTextProvider(unsafe).interpret(request)).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  const invalid = options('{"intent":"safe","callRelative":true}');
  await expect(new DeepSeekWearerTextProvider(invalid).interpret(request)).rejects.toThrow('Invalid wearer text decision');
  const newPhrase = options('{"intent":"unwell"}');
  expect(await new DeepSeekWearerTextProvider(newPhrase).interpret({ ...request, text: '胸前像被压着一样' })).toMatchObject({ intent: 'unwell', suggestedAction: 'wearer_unwell' });
  const unsupportedSafe = options('{"intent":"safe"}');
  expect(await new DeepSeekWearerTextProvider(unsupportedSafe).interpret({ ...request, text: '没有胸痛' })).toMatchObject({ intent: 'uncertain', suggestedAction: null });
});
