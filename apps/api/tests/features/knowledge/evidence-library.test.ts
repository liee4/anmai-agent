import { expect, it } from 'vitest';
import { knowledgeForRisk } from '../../../src/features/knowledge/evidence-library.js';

it('retrieves bounded, versioned source notes for the observed channels', () => {
  const selected = knowledgeForRisk({ level: 'abnormal', reasons: ['heart_rate_persistent', 'spo2_persistent'], assessedAt: '2026-11-10T00:00:00Z' });
  expect(selected.map(item => item.id)).toEqual(['heart-symptoms', 'oximeter-limitations']);
  expect(selected.every(item => item.version === '2026-11-10.1' && item.reviewStatus === 'source_verified_pending_clinical_review')).toBe(true);
  expect(selected.every(item => item.sourceUrl.startsWith('https://'))).toBe(true);
  expect(selected.every(item => !item.summary.includes('立即自动呼救'))).toBe(true);
});

it('does not attach heart-attack or stroke notes to a data-quality failure', () => {
  const selected = knowledgeForRisk({ level: 'untrusted_data', reasons: ['device_untrusted_or_invalid'], assessedAt: '2026-11-10T00:00:00Z' });
  expect(selected.map(item => item.id)).toEqual(['oximeter-limitations']);
});
