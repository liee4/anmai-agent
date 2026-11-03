import { describe, expect, it } from 'vitest';
import { DeepSeekBaselineProvider } from '../../../src/features/baseline/deepseek-baseline-provider.js';
import type { BaselineGenerationRequest } from '@anmai/contracts';

const request: BaselineGenerationRequest = { wearerId: 'wearer-1', cycleId: 'cycle-1', cycleStart: '2026-10-01T00:00:00Z', cycleEnd: '2026-10-14T23:59:59Z', validDays: 10, observations: [], recentBaselines: [], longTermSummary: null, evidenceWeights: { current: 1, recent: 0, longTerm: 0 }, allowedRanges: {}, evidenceRefs: ['cycle-1'] };
const output = { baselineCandidate: { contexts: { resting: {}, activity: {}, night: {} }, confidence: 'medium', observations: [], evidenceRefs: ['cycle-1'] }, updatedLongTermSummaryCandidate: null };

describe('DeepSeek provider boundary', () => {
  it('parses a structured candidate without database access', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string) => { calls.push(url); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) } as Response; };
    const provider = new DeepSeekBaselineProvider({ apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', fetcher: fakeFetch as typeof fetch });
    expect(await provider.generateCandidate(request)).toEqual(output);
    expect(calls).toEqual(['https://api.deepseek.com/chat/completions']);
  });

  it('rejects blank content instead of publishing it', async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '   ' } }] }) }) as Response;
    const provider = new DeepSeekBaselineProvider({ apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', fetcher: fakeFetch as typeof fetch });
    await expect(provider.generateCandidate(request)).rejects.toThrow(/empty/);
  });
});
