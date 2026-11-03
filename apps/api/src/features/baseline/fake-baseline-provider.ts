import type { BaselineCandidate, BaselineGenerationRequest } from '@anmai/contracts';
import type { BaselineModelProvider } from './baseline-model-provider.js';

/** Deterministic demo provider; it never makes a network request. */
export class FakeBaselineProvider implements BaselineModelProvider {
  async generateCandidate(request: BaselineGenerationRequest): Promise<BaselineCandidate> {
    const contexts: BaselineCandidate['baselineCandidate']['contexts'] = { resting: {}, activity: {}, night: {} };
    for (const [key, [lower, upper]] of Object.entries(request.allowedRanges)) {
      const [context, field] = key.split('.') as [keyof typeof contexts, keyof typeof contexts.resting];
      contexts[context][field] = Number(((lower + upper) / 2).toFixed(1));
    }
    return {
      baselineCandidate: { contexts, confidence: 'medium', observations: ['模拟 Provider 根据本地观察统计生成候选；此结果仅用于比赛演示。'], evidenceRefs: [request.evidenceRefs[0]!] },
      updatedLongTermSummaryCandidate: request.longTermSummary,
    };
  }
}
