import { describe, expect, it } from 'vitest';
import { generateBaseline } from '../../../src/features/baseline/baseline-generation-module.js';
import type { BaselineCandidate, BaselineGenerationRequest } from '@anmai/contracts';

const request: BaselineGenerationRequest = { wearerId: 'wearer-1', cycleId: 'cycle-1', cycleStart: '2026-10-01T00:00:00Z', cycleEnd: '2026-10-14T23:59:59Z', validDays: 10, observations: [], recentBaselines: [], longTermSummary: null, evidenceWeights: { current: 1, recent: 0, longTerm: 0 }, allowedRanges: { 'resting.heartRateWarningUpper': [100, 115] }, evidenceRefs: ['cycle-1'] };
const candidate = (value: number): BaselineCandidate => ({ baselineCandidate: { contexts: { resting: { heartRateWarningUpper: value }, activity: {}, night: {} }, confidence: 'medium', observations: [], evidenceRefs: ['cycle-1'] }, updatedLongTermSummaryCandidate: null });

describe('baseline generation', () => {
  it('locks a valid field and publishes it on the first attempt', async () => {
    const seen: number[] = [];
    const result = await generateBaseline(request, { generateCandidate: async (_, correction) => { seen.push(correction?.attempt ?? 1); return candidate(108); } });
    expect(result.values).toEqual({ 'resting.heartRateWarningUpper': 108 });
    expect(seen).toEqual([1]);
  });

  it('uses at most five attempts and falls back when a field stays invalid', async () => {
    let calls = 0;
    const result = await generateBaseline(request, { generateCandidate: async () => { calls++; return candidate(130); } }, { 'resting.heartRateWarningUpper': 105 });
    expect(calls).toBe(5);
    expect(result.values).toEqual({ 'resting.heartRateWarningUpper': 105 });
    expect(result.attempts).toHaveLength(5);
    expect(result.attempts[4]?.rejected).toContain('resting.heartRateWarningUpper');
  });

  it('rejects evidence not present in the request', async () => {
    const result = await generateBaseline(request, { generateCandidate: async () => ({ ...candidate(108), baselineCandidate: { ...candidate(108).baselineCandidate, evidenceRefs: ['excluded-event'] } }) });
    expect(result.values['resting.heartRateWarningUpper']).toBe(100);
  });
  it('validates long-term text independently of threshold fields', async () => {
    const result = await generateBaseline(request, { generateCandidate: async () => ({ ...candidate(130), updatedLongTermSummaryCandidate: '静息心率连续多个周期保持稳定。' }) });
    expect(result.fallbackFields).toContain('resting.heartRateWarningUpper');
    expect(result.longTermSummary).toBe('静息心率连续多个周期保持稳定。');
  });
});
