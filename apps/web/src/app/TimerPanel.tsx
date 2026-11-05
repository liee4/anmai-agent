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
  const [observationSeconds, setObservationSeconds] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { void Promise.all([api.timers(), api.riskReviewTimer()]).then(([timers, review]) => { setSettings(timers); setObservationSeconds(review.observationSeconds); }).catch(error => setMessage(String(error))); }, []);

  async function save() {
    if (!settings || observationSeconds === null) return;
    try { await api.setRiskReviewTimer(observationSeconds); setSettings(await api.setTimers(settings)); setMessage('已保存。新复核或事件将使用这组时间。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  return <div className="timer-panel"><h3>演示等待时间</h3><div className="timer-fields"><label>模型短时观察<span><input type="number" min="1" max="3600" value={observationSeconds ?? ''} onChange={event => setObservationSeconds(Number(event.target.value))}/> 秒</span></label>{fields.map(field => <label key={field.key}>{field.label}<span><input type="number" min="1" max="3600" value={settings?.[field.key] ?? ''} onChange={event => setSettings(previous => previous ? { ...previous, [field.key]: Number(event.target.value) } : previous)}/> 秒</span></label>)}</div><button disabled={!settings || observationSeconds === null} onClick={() => void save()}>保存等待时间</button>{message && <p role="status">{message}</p>}</div>;
}
