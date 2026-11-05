import { RiskReviewDecisionSchema, type RiskReviewDecision } from '@anmai/contracts';
import { Value } from '@sinclair/typebox/value';
import type { RiskReviewProvider, RiskReviewRequest } from './risk-review-provider.js';

export class DeepSeekRiskReviewProvider implements RiskReviewProvider {
  constructor(private readonly options: { apiKey: string; baseUrl: string; model: string; fetcher?: typeof fetch }) {}

  async review(request: RiskReviewRequest): Promise<RiskReviewDecision> {
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ model: this.options.model, temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '你是模拟健康监测的普通异常复核器。只返回 JSON 对象 decision(ask|observe|uncertain) 和简短 reason。最多建议一次短时观察。不能修改风险等级、固定阈值、截止时间或调用亲属和急救工具；证据不足选 uncertain。' },
        { role: 'user', content: JSON.stringify(request) },
      ] }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned empty review');
    let value: unknown;
    try { value = JSON.parse(content); } catch { throw new Error('DeepSeek returned invalid review JSON'); }
    if (!Value.Check(RiskReviewDecisionSchema, value)) throw new Error('DeepSeek review schema mismatch');
    return value;
  }
}
