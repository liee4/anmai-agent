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
          { role: 'system', content: '你是个人健康基线候选生成器。只返回符合给定 JSON Schema 的 JSON 对象，不要 Markdown。不得修改观察统计、固定安全边界或应急逻辑。' },
          { role: 'user', content: JSON.stringify({
            task: '根据观察基线和加权历史证据，为 allowedRanges 中每个场景.字段生成一个数值候选。候选必须位于对应闭区间内。contexts 必须包含 resting、activity、night 三个对象；证据不足的场景使用空对象。evidenceRefs 只能从 request.evidenceRefs 选取，至少包含当前 cycleId。observations 只写简短、可由证据支持的个人规律。updatedLongTermSummaryCandidate 为不超过 800 字的规律摘要；无可更新内容时填 null。若提供 correction，只修改 rejectedFields；已通过的 lockedFields 不要再输出。不要输出未在 Schema 中定义的字段。',
            request,
            correction: correction ?? null,
            outputSchema: BaselineCandidateSchema,
          }) },
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
