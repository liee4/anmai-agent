import type { BaselineModelProvider } from '../baseline/baseline-model-provider.js';
import { FakeBaselineProvider } from '../baseline/fake-baseline-provider.js';
import { DeepSeekBaselineProvider } from '../baseline/deepseek-baseline-provider.js';
import type { RiskReviewProvider } from '../monitoring/risk-review-provider.js';
import { FakeRiskReviewProvider } from '../monitoring/fake-risk-review-provider.js';
import { DeepSeekRiskReviewProvider } from '../monitoring/deepseek-risk-review-provider.js';
import type { MessageProvider } from '../agent/message-provider.js';
import { FakeMessageProvider } from '../agent/fake-message-provider.js';
import { DeepSeekMessageProvider } from '../agent/deepseek-message-provider.js';
import type { DemoSessions } from './demo-session.js';

export function demoProviders(sessions: DemoSessions, options: { apiKey: string | undefined; baseUrl?: string | undefined; model?: string | undefined; fetcher?: typeof fetch | undefined }) {
  const fakeBaseline = new FakeBaselineProvider();
  const fakeReview = new FakeRiskReviewProvider();
  const fakeMessage = new FakeMessageProvider();
  const configuration = { apiKey: options.apiKey ?? '', baseUrl: options.baseUrl ?? 'https://api.deepseek.com', model: options.model ?? 'deepseek-flash', ...(options.fetcher ? { fetcher: options.fetcher } : {}) };
  const realBaseline = options.apiKey ? new DeepSeekBaselineProvider(configuration) : null;
  const realReview = options.apiKey ? new DeepSeekRiskReviewProvider(configuration) : null;
  const realMessage = options.apiKey ? new DeepSeekMessageProvider(configuration) : null;
  function choose<T>(wearerId: string, fake: T, real: T | null): T {
    if (sessions.mode(wearerId) === 'fake') return fake;
    if (!real) throw new Error('DeepSeek is not configured');
    sessions.consume(wearerId);
    return real;
  }
  async function invoke<T>(wearerId: string, work: () => Promise<T>): Promise<T> { const leave = sessions.enter(wearerId); try { return await work(); } finally { leave(); } }
  const baseline: BaselineModelProvider = { generateCandidate: (request, correction) => invoke(request.wearerId, () => choose<BaselineModelProvider>(request.wearerId, fakeBaseline, realBaseline).generateCandidate(request, correction)) };
  const review: RiskReviewProvider = { review: request => invoke(request.wearerId, () => choose<RiskReviewProvider>(request.wearerId, fakeReview, realReview).review(request)) };
  const message: MessageProvider = { compose: request => invoke(request.event.wearerId, () => choose<MessageProvider>(request.event.wearerId, fakeMessage, realMessage).compose(request)) };
  return { baseline, review, message, nameFor: (wearerId: string) => sessions.mode(wearerId) };
}
