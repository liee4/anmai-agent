import { describe, expect, it } from 'vitest';
import { blendThresholdEvidence, evidenceWeights } from '../../../src/features/baseline/memory-assembler.js';

describe('baseline memory weights', () => {
  it('allocates current, recent and long-term evidence at 60/30/10', () => {
    expect(evidenceWeights(4, true)).toEqual({ current: 0.6, recent: [0.16, 0.08, 0.04, 0.02], longTerm: 0.1 });
  });

  it('reallocates absent recent evidence to the current cycle', () => {
    expect(evidenceWeights(0, true)).toEqual({ current: 0.9, recent: [], longTerm: 0.1 });
    expect(evidenceWeights(0, false)).toEqual({ current: 1, recent: [], longTerm: 0 });
  });
  it('applies 60/30/10 to numeric evidence before the provider sees it', () => {
    const weights = evidenceWeights(1, true);
    const blended = blendThresholdEvidence({ 'resting.heartRateWarningUpper': [90, 110] }, [{ 'resting.heartRateWarningUpper': 108 }], { 'resting.heartRateWarningUpper': 105 }, weights);
    expect(blended['resting.heartRateWarningUpper']).toBeCloseTo(102.9);
  });
});
