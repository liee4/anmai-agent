import type { RiskReviewProvider, RiskReviewRequest } from './risk-review-provider.js';

export class FakeRiskReviewProvider implements RiskReviewProvider {
  async review(_request: RiskReviewRequest) {
    return { decision: 'observe' as const, reason: '模拟复核：建议短时观察，期满仍异常即询问佩戴者' };
  }
}
