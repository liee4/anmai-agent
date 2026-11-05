import type { MessageProvider, MessageContent } from './message-provider.js';

export class DeepSeekMessageProvider implements MessageProvider {
  constructor(private readonly options: { apiKey: string; baseUrl: string; model: string; fetcher?: typeof fetch }) {}

  async compose(request: Parameters<MessageProvider['compose']>[0]): Promise<MessageContent> {
    const fields = Object.keys(request.fallback);
    if (!fields.length) return {};
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ model: this.options.model, temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: `你只负责为已确定的安脉演示事件写简短中文提示。只返回 JSON，字段只能是 ${fields.join(',')}，每字段不超过 300 字。不能改变状态、接收者、计时、风险判断。emergencyScript 只用于系统模拟自动呼救，不用于亲属自行呼救。` },
        { role: 'user', content: JSON.stringify({ state: request.event.state, risk: request.event.risk, locationName: request.event.location?.name ?? null, fallback: request.fallback }) },
      ] }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty message');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error('Invalid message JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => !fields.includes(key))) throw new Error('Invalid message fields');
    for (const field of fields) if (typeof (parsed as Record<string, unknown>)[field] !== 'string' || !(parsed as Record<string, string>)[field]?.trim() || (parsed as Record<string, string>)[field]!.length > 300) throw new Error('Invalid message text');
    return parsed as MessageContent;
  }
}
