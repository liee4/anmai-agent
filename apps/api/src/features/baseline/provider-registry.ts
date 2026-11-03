import type { BaselineModelProvider } from './baseline-model-provider.js';
import { DeepSeekBaselineProvider } from './deepseek-baseline-provider.js';
import { FakeBaselineProvider } from './fake-baseline-provider.js';

export function createBaselineProvider(env: NodeJS.ProcessEnv = process.env): { name: string; provider: BaselineModelProvider } {
  const name = env.BASELINE_PROVIDER ?? 'fake';
  if (name === 'fake') return { name, provider: new FakeBaselineProvider() };
  if (name !== 'deepseek') throw new Error(`Unsupported baseline provider: ${name}`);
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required for the DeepSeek provider');
  return { name, provider: new DeepSeekBaselineProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', model: env.DEEPSEEK_MODEL ?? 'deepseek-flash' }) };
}
