import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmergencyEvent } from '@anmai/contracts';
import { EmergencyCard } from '../src/app/EmergencyCard.js';
import { RiskReviewStatus } from '../src/app/RiskReviewStatus.js';
import { RiskEvidenceSummary } from '../src/app/RiskEvidenceSummary.js';

const event: EmergencyEvent = { eventId: 'demo-event-123', wearerId: 'demo-wearer', state: 'primary_contact', stateVersion: 2, createdAt: '2026-11-04T00:00:00Z', deadlineAt: '2026-11-04T00:00:30Z', timerSettings: { wearerResponseSeconds: 60, primaryRelativeSeconds: 30, otherRelativesSeconds: 30, safeRecheckSeconds: 300 }, baselineVersion: 1, location: null, risk: { level: 'worsening', score: 10, reasons: ['fixed_heart_rate_high'], assessedAt: '2026-11-04T00:00:00Z' } };

it('shows channel quality and duration without a total risk score', () => {
  const html = renderToStaticMarkup(<RiskEvidenceSummary risk={{ level: 'abnormal', reasons: ['heart_rate_persistent'], assessedAt: '2026-11-04T00:00:00Z', evidence: { context: 'resting', quality: { heartRate: 'valid', spo2: 'missing', bloodPressure: 'missing' }, values: { heartRate: 110 }, deviation: { heartRateHigh: 3.2 }, coverageSeconds: { heartRate: 10, spo2: 0 }, abnormalSeconds: { heartRate: 27, spo2: 0 }, trend: 'none', fixedBoundary: false } }} />);
  expect(html).toContain('心率有效');
  expect(html).toContain('持续异常 27/30 秒');
  expect(html).toContain('最近覆盖 10/10 秒');
  expect(html).toContain('血氧未采集');
  expect(html).not.toContain('风险分数');
});

it('shows model observation and keeps the wearer help control available', () => {
  const html = renderToStaticMarkup(<RiskReviewStatus review={{ status: 'observe', provider: 'deepseek', decision: 'observe', reason: '继续复测', deadlineAt: '2026-11-04T00:00:30Z', fallbackReason: null }} risk={event.risk} seconds={12} busy={false} onHelp={() => undefined} />);
  expect(html).toContain('复核模型：deepseek');
  expect(html).toContain('剩余 12 秒');
  expect(html).toContain('我不舒服，需要亲属');
  expect(html).not.toContain('API_KEY');
});

it('shows card facts and marks unavailable medical details as unregistered', () => {
  const html = renderToStaticMarkup(<EmergencyCard event={event} card={{ eventId: event.eventId, name: null, age: null, medicalHistory: null, allergies: null, latest: { timestamp: '2026-11-04T00:00:30Z', heartRate: 132, spo2: 95, activity: 'resting' }, trend: { heartRateDelta: 12, spo2Delta: -2, systolicBPDelta: null }, wearerFeedback: '表示不舒服，需要亲属' }} contacts={[{ contactId: 'primary', role: 'primary', label: '主要亲属', phase: 'primary_contact', status: 'delivered', attempts: 1, retryAt: null }]} messages={{ provider: 'fake', relativeSummary: '请查看紧急事件卡' }} />);
  expect(html).toContain('未登记');
  expect(html).toContain('132 次/分');
  expect(html).toContain('心率 +12');
  expect(html).toContain('表示不舒服');
  expect(html).toContain('主要亲属');
  expect(html).not.toContain('模拟自动呼救播报');
});
