import { useState } from 'react';
import type { WearerTextInterpretation } from '../api/client.js';

export function WearerTextReply({ busy, onInterpret, onConfirm }: {
  busy: boolean;
  onInterpret: (text: string) => Promise<WearerTextInterpretation>;
  onConfirm: (kind: 'wearer_unwell' | 'wearer_safe') => void;
}) {
  const [text, setText] = useState('');
  const [interpretation, setInterpretation] = useState<WearerTextInterpretation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function interpret() {
    setPending(true); setError(''); setInterpretation(null);
    try { setInterpretation(await onInterpret(text)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setPending(false); }
  }

  return <div className="wearer-reply">
    <label htmlFor="wearer-reply-text">也可以用文字描述目前的感受</label>
    <div className="wearer-reply-input"><input id="wearer-reply-text" maxLength={200} value={text} disabled={busy || pending} placeholder="例如：胸口不舒服" onChange={event => { setText(event.target.value); setInterpretation(null); }} /><button disabled={busy || pending || !text.trim()} onClick={() => void interpret()}>理解我的回复</button></div>
    {error && <p role="alert">{error}</p>}
    {interpretation && <div className="wearer-reply-result" role="status"><span>{interpretation.summary}（{interpretation.provider === 'deepseek' ? 'DeepSeek 理解' : interpretation.provider === 'local_fallback' ? '本地规则回退' : '本地规则理解'}）</span>{interpretation.suggestedAction && <button className={interpretation.intent === 'unwell' ? 'primary' : ''} disabled={busy || pending} onClick={() => onConfirm(interpretation.suggestedAction!)}>{interpretation.intent === 'unwell' ? '确认联系亲属' : '确认我没事'}</button>}</div>}
    <small>文字仅用于给出建议；确认前不会改变应急流程。无法理解时请使用上方固定选项。</small>
  </div>;
}
