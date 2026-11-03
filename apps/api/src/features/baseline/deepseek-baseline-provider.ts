import { BaselineCandidateSchema, type BaselineCandidate, type BaselineGenerationRequest } from '@anmai/contracts';
import { Value } from '@sinclair/typebox/value';
import type { BaselineModelProvider, CorrectionFeedback } from './baseline-model-provider.js';

export interface DeepSeekOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class DeepSeekBaselineProvider implements BaselineModelProvider {
  constructor(private readonly options: DeepSeekOptions) {}

  async generateCandidate(request: BaselineGenerationRequest, correction?: CorrectionFeedback): Promise<BaselineCandidate> {
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是个人健康基线候选生成器。只返回 JSON。不得修改观察统计、固定安全边界或应急逻辑。' },
          { role: 'user', content: JSON.stringify({ request, correction, outputSchema: 'baselineCandidate: {contexts: {resting, activity, night}, confidence, observations, evidenceRefs}; updatedLongTermSummaryCandidate: string|null' }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('DeepSeek returned empty content');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error('DeepSeek returned invalid JSON'); }
    if (!Value.Check(BaselineCandidateSchema, parsed)) throw new Error('DeepSeek candidate schema mismatch');
    return parsed;
  }
}
