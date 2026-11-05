import { expect, it } from 'vitest';
import { openDatabase } from '../../../src/infra/database.js';
import { FakeClock } from '../../../src/clock.js';
import { EmergencyService } from '../../../src/features/emergency/emergency-service.js';
import { MessageService } from '../../../src/features/agent/message-service.js';

it('keeps a local warning ready and accepts a validated model message later', async () => {
  const db = openDatabase(':memory:');
  const clock = new FakeClock(new Date('2026-11-04T00:00:00Z'));
  const emergency = new EmergencyService(db, clock);
  const event = emergency.start('w', { level: 'abnormal', score: 2, reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z' });
  let release!: (value: { wearerPrompt: string }) => void;
  const messages = new MessageService(db, clock, { compose: () => new Promise(resolve => { release = resolve; }) }, 'test');
  const pending = messages.ensure(event);
  expect(messages.get(event.eventId, event.state)?.wearerPrompt).toContain('体征');
  release({ wearerPrompt: '检测到心率持续异常，请确认您的状态。' });
  await pending;
  expect(messages.get(event.eventId, event.state)?.wearerPrompt).toContain('心率');
  db.close();
});
