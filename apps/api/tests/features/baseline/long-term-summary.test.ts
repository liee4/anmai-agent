import { describe, expect, it } from 'vitest';
import { assembleLongTermMemory } from '../../../src/features/baseline/long-term-summary.js';

const record = (version: number, value: number) => ({ version, baseline: { values: { 'resting.heartRateWarningUpper': value } } });

describe('long-term baseline memory', () => {
  it('folds the fifth-oldest predecessor into compact numeric facts', () => {
    const result = assembleLongTermMemory([record(4, 108), record(3, 107), record(2, 106), record(1, 105)]);
    expect(result.recent.map(item => item.version)).toEqual([4, 3, 2]);
    expect(result.olderVersions).toEqual([1]);
    expect(result.numericFacts['resting.heartRateWarningUpper']).toBe(105);
    expect(result.summary).toContain('105');
  });
});
