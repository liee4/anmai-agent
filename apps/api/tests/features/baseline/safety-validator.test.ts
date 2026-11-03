import { describe, expect, it } from 'vitest';
import { validateBaselineCandidate } from '../../../src/features/baseline/baseline-safety-validator.js';
import type { BaselineCandidate, BaselineGenerationRequest } from '@anmai/contracts';

const request: BaselineGenerationRequest = { wearerId: 'w', cycleId: 'cycle-1', cycleStart: '2026-10-01T00:00:00Z', cycleEnd: '2026-10-14T23:59:59Z', validDays: 14, observations: [], recentBaselines: [], longTermSummary: null, evidenceWeights: { current: 1, recent: 0, longTerm: 0 }, allowedRanges: { 'resting.heartRateWarningUpper': [90, 119], 'resting.spo2WarningLower': [93, 99] }, evidenceRefs: ['cycle-1'] };
const candidate: BaselineCandidate = { baselineCandidate: { contexts: { resting: { heartRateWarningUpper: 110, spo2WarningLower: 96 }, activity: {}, night: {} }, confidence: 'medium', observations: [], evidenceRefs: ['cycle-1'] }, updatedLongTermSummaryCandidate: null };

describe('baseline safety validator', () => {
  it('rejects only fields whose change from the last version is too large', () => {
    const result = validateBaselineCandidate(request, candidate, {}, { 'resting.heartRateWarningUpper': 100, 'resting.spo2WarningLower': 95 });
    expect(result.accepted).toEqual({ 'resting.spo2WarningLower': 96 });
    expect(result.rejected).toMatchObject([{ field: 'resting.heartRateWarningUpper', reason: 'version_delta_exceeded' }]);
  });
});
