import { useEffect, useState } from 'react';
import { api, type DemoSession } from '../api/client.js';

export function ProviderModePanel({ onChange }: { onChange: () => void }) {
  const [state, setState] = useState<Pick<DemoSession, 'mode' | 'deepseekConfigured' | 'remaining'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const update = () => void api.providerMode().then(setState).catch(failure => setError(String(failure))); update(); const timer = setInterval(update, 5_000); return () => clearInterval(timer); }, []);
  async function switchTo(mode: 'fake' | 'deepseek') {
    setBusy(true); setError('');
    try { setState(await api.setProviderMode(mode)); onChange(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  if (!state && !error) return null;
  return <div className="provider-mode" aria-label="演示模型模式"><span>演示模型</span><button disabled={busy || state?.mode === 'fake'} onClick={() => void switchTo('fake')}>Fake</button><button disabled={busy || state?.mode === 'deepseek' || !state?.deepseekConfigured || state.remaining === 0} onClick={() => void switchTo('deepseek')}>DeepSeek</button><small>{state?.deepseekConfigured ? `剩余额度 ${state.remaining} 次` : '后端未配置 DeepSeek Key'}</small>{error && <span role="alert">{error}</span>}</div>;
}
