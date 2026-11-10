import { interpretWearerText, validateWearerText, wearerTextDecision } from './wearer-text.js';
import type { WearerTextProvider } from './wearer-text-provider.js';

export class DeepSeekWearerTextProvider implements WearerTextProvider {
  constructor(private readonly options: { apiKey: string; baseUrl: string; model: string; fetcher?: typeof fetch }) {}

  async interpret(request: Parameters<WearerTextProvider['interpret']>[0]) {
    const text = validateWearerText(request.text);
    const local = interpretWearerText(text);
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ model: this.options.model, temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '你只理解健康监测演示中佩戴者的简短中文回复。只返回 JSON 对象，唯一字段 intent，值只能是 unwell、safe、uncertain。提到胸部或心脏疼痛、呼吸困难、头晕等不适，即使同时说没事，也选 unwell。明确否认单个症状不等于整体没事。不能诊断、设定阈值、改变事件状态或联系任何人；含糊时选 uncertain。' },
        { role: 'user', content: JSON.stringify({ text, risk: { level: request.risk.level, reasons: request.risk.reasons } }) },
      ] }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const content = payload.choices?.[0]?.message?.content;
    let parsed: unknown;
    try { parsed = JSON.parse(content ?? ''); } catch { throw new Error('Invalid wearer text decision'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || !['unwell', 'safe', 'uncertain'].includes((parsed as { intent?: string }).intent ?? '')) throw new Error('Invalid wearer text decision');
    const intent = (parsed as { intent: 'unwell' | 'safe' | 'uncertain' }).intent;
    if (local.intent === 'unwell') return local;
    if (intent === 'safe' && local.intent !== 'safe') return wearerTextDecision('uncertain');
    return wearerTextDecision(intent);
  }
}
