import type { RiskReviewProvider } from './risk-review-provider.js';
import { FakeRiskReviewProvider } from './fake-risk-review-provider.js';
import { DeepSeekRiskReviewProvider } from './deepseek-risk-review-provider.js';

export function createRiskReviewProvider(env: NodeJS.ProcessEnv = process.env): { name: string; provider: RiskReviewProvider } {
  const name = env.RISK_REVIEW_PROVIDER ?? 'fake';
  if (name === 'fake') return { name, provider: new FakeRiskReviewProvider() };
  if (name !== 'deepseek') throw new Error(`Unsupported risk review provider: ${name}`);
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required for DeepSeek risk review');
  return { name, provider: new DeepSeekRiskReviewProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', model: env.DEEPSEEK_MODEL ?? 'deepseek-flash' }) };
}
