import { useEffect, useState } from 'react';
import type { TimerSettings } from '@anmai/contracts';
import { api } from '../api/client.js';

const fields: { key: keyof TimerSettings; label: string }[] = [
  { key: 'wearerResponseSeconds', label: '佩戴者回应' },
  { key: 'primaryRelativeSeconds', label: '主要亲属接管' },
  { key: 'otherRelativesSeconds', label: '其他亲属接管' },
  { key: 'safeRecheckSeconds', label: '持续异常复查' },
];

export function TimerPanel() {
  const [settings, setSettings] = useState<TimerSettings | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { void api.timers().then(setSettings).catch(error => setMessage(String(error))); }, []);

  async function save() {
    if (!settings) return;
    try { setSettings(await api.setTimers(settings)); setMessage('已保存。新事件将使用这组时间。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  return <div className="timer-panel"><h3>演示等待时间</h3><div className="timer-fields">{fields.map(field => <label key={field.key}>{field.label}<span><input type="number" min="1" max="3600" value={settings?.[field.key] ?? ''} onChange={event => setSettings(previous => previous ? { ...previous, [field.key]: Number(event.target.value) } : previous)}/> 秒</span></label>)}</div><button disabled={!settings} onClick={() => void save()}>保存等待时间</button>{message && <p role="status">{message}</p>}</div>;
}
