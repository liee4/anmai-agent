import type { MessageProvider } from './message-provider.js';
import { FakeMessageProvider } from './fake-message-provider.js';
import { DeepSeekMessageProvider } from './deepseek-message-provider.js';

export function createMessageProvider(env: NodeJS.ProcessEnv = process.env): { name: string; provider: MessageProvider } {
  const name = env.MESSAGE_PROVIDER ?? 'fake';
  if (name === 'fake') return { name, provider: new FakeMessageProvider() };
  if (name !== 'deepseek') throw new Error(`Unsupported message provider: ${name}`);
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required for DeepSeek messages');
  return { name, provider: new DeepSeekMessageProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', model: env.DEEPSEEK_MODEL ?? 'deepseek-flash' }) };
}
