import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type Dashboard, type DemoInput } from '../api/client.js';
import { EventTimeline } from './EventTimeline.js';
import { EmergencyCard } from './EmergencyCard.js';
import { GuidedDemo, type Journey } from './GuidedDemo.js';
import { ProviderModePanel } from './ProviderModePanel.js';
import { TimerPanel } from './TimerPanel.js';

const scenarioFor: Partial<Record<Journey, string>> = { rest: 'normal', activity: 'activity', responsive: 'abnormal', noanswer: 'abnormal', worsening: 'worsening', device: 'loose_device' };
const labelFor: Record<Journey, string> = { baseline: '个人基线', rest: '正常静息', activity: '正常活动', responsive: '异常 · 有回应', noanswer: '异常 · 无回应', worsening: '明显恶化', device: '设备松动' };
const riskLabel: Record<string, string> = { normal: '体征平稳', abnormal: '持续异常', worsening: '明显恶化', untrusted_data: '数据不可信', mild: '轻度偏离' };
const journeyKeys: Journey[] = ['baseline', 'rest', 'activity', 'responsive', 'noanswer', 'worsening', 'device'];

function speakSimulation(script: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(script);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function App() {
  const [wearerId, setWearerId] = useState('');
  const [publicDemo, setPublicDemo] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selected, setSelected] = useState<Journey>('baseline');
  const [lastInput, setLastInput] = useState<DemoInput | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputViewRevision, setInputViewRevision] = useState(0);

  useLayoutEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.setSelectionRange(0, 0);
    inputRef.current.scrollTo(0, 0);
  }, [inputViewRevision]);

  useEffect(() => { void api.session().then(session => { setPublicDemo(session.publicDemo); setWearerId(session.wearerId); }).catch(failure => setError(String(failure))); }, []);
  useEffect(() => {
    if (!wearerId) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(`anmai-journey:${wearerId}`) ?? 'null') as { journey?: Journey; input?: DemoInput } | null;
      if (stored?.journey && journeyKeys.includes(stored.journey)) { setSelected(stored.journey); setLastInput(stored.input ?? null); }
    } catch { /* Storage may be unavailable; the backend state remains authoritative. */ }
  }, [wearerId]);
  const refresh = useCallback(async () => { if (!wearerId) return; try { setDashboard(await api.dashboard(wearerId)); } catch (failure) { setError(String(failure)); } }, [wearerId]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 1000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    if (!wearerId) return;
    const stream = new EventSource(`/api/events/stream?wearerId=${encodeURIComponent(wearerId)}`);
    const update = () => { void refresh(); };
    stream.addEventListener('snapshot', update);
    stream.addEventListener('update', update);
    return () => stream.close();
  }, [refresh, wearerId]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function importData() {
    await run(async () => {
      const response = await api.ingest(JSON.parse(input));
      setInput(''); setInputViewRevision(value => value + 1);
      setSelected('baseline'); setLastInput(null);
      try { sessionStorage.setItem(`anmai-journey:${wearerId}`, JSON.stringify({ journey: 'baseline' })); } catch { /* Optional browser state. */ }
      setResult(`导入覆盖 ${response.coveredDays} 天 · 有效 ${response.successfulDays} 天 · 完整周期 ${response.completedCycles} 个 · 当前基线 ${response.baselineVersion ? `v${response.baselineVersion}` : '尚无'}`);
    });
  }

  async function importNextDemoHistory() {
    await run(async () => {
      const next = await api.nextDemoHistory(wearerId);
      const start = next.data[0]?.timestamp.slice(0, 10) ?? '未知';
      const end = next.data.at(-1)?.timestamp.slice(0, 10) ?? '未知';
      const response = await api.ingest(next);
      setInput(''); setInputViewRevision(value => value + 1);
      setSelected('baseline'); setLastInput(null);
      try { sessionStorage.setItem(`anmai-journey:${wearerId}`, JSON.stringify({ journey: 'baseline' })); } catch { /* Optional browser state. */ }
      setResult(`${start} — ${end} 的模拟数据已导入；有效 ${response.successfulDays} 天，当前基线 ${response.baselineVersion ? `v${response.baselineVersion}` : '尚无'}${response.modelCalls === 0 ? '；本轮未调用基线模型' : `；模型调用 ${response.modelCalls} 次`}`);
    });
  }

  async function fillNextDemoHistory() {
    await run(async () => {
      const next = await api.nextDemoHistory(wearerId);
      setInput(JSON.stringify(next)); setInputViewRevision(value => value + 1);
      setResult(`已填入 ${next.data[0]?.timestamp.slice(0, 10)} 至 ${next.data.at(-1)?.timestamp.slice(0, 10)} 的演示数据；点击“导入并检查基线”。`);
    });
  }

  async function resetDemo() {
    if (!window.confirm('确定清空演示佩戴者的体征、基线和应急事件吗？此操作无法撤销。')) return;
    await run(async () => {
      await api.resetDemo(wearerId);
      setInput(''); setInputViewRevision(value => value + 1);
      setSelected('baseline');
      setLastInput(null);
      try { sessionStorage.removeItem(`anmai-journey:${wearerId}`); } catch { /* Optional browser state. */ }
      setResult('演示数据已重置；下一次从 2026-10-01 开始导入首轮 14 天。');
    });
  }

  function chooseJourney(journey: Journey) {
    const scenario = scenarioFor[journey];
    if (!scenario) { setSelected(journey); setLastInput(null); setResult(''); try { sessionStorage.setItem(`anmai-journey:${wearerId}`, JSON.stringify({ journey })); } catch { /* Optional browser state. */ } return; }
    setResult('');
    void run(async () => {
      const response = await api.scenario(wearerId, scenario);
      setSelected(journey);
      setLastInput(response.demoInput);
      try { sessionStorage.setItem(`anmai-journey:${wearerId}`, JSON.stringify({ journey, input: response.demoInput })); } catch { /* Optional browser state. */ }
      setResult(`${labelFor[journey]}：规则判断为${riskLabel[response.risk.level] ?? response.risk.level}。`);
    });
  }

  function act(kind: string) {
    const event = dashboard?.event;
    if (!event) return;
    void run(() => api.action(event, kind));
  }

  const event = dashboard?.event;
  const emergencyScript = event?.state === 'simulated_call' ? dashboard?.messages?.emergencyScript ?? `这里是安脉健康监测系统。佩戴者出现持续异常体征且无人接管。位置：${event.location?.name ?? '尚无位置数据'}。此通话仅为模拟。` : null;
  const wearerPrompt = event?.state === 'wearer_alert' || (event?.state === 'primary_contact' && event.risk.level === 'worsening') ? dashboard?.messages?.wearerPrompt ?? '检测到体征异常，请确认您现在是否不舒服。' : null;
  useEffect(() => {
    if (!wearerPrompt || !event || !('speechSynthesis' in window)) return;
    speakSimulation(wearerPrompt);
    const interval = Math.floor(event.timerSettings.wearerResponseSeconds * 1000 / 3);
    const reminders = [setTimeout(() => speakSimulation(wearerPrompt), interval), setTimeout(() => speakSimulation(wearerPrompt), interval * 2)];
    return () => { reminders.forEach(clearTimeout); window.speechSynthesis.cancel(); };
  }, [event?.eventId, event?.state, wearerPrompt]);
  useEffect(() => {
    if (!emergencyScript || !('speechSynthesis' in window)) return;
    speakSimulation(emergencyScript);
    return () => window.speechSynthesis.cancel();
  }, [emergencyScript]);

  if (!wearerId || !dashboard) return <div className="loading-screen"><p role="status">正在载入演示会话…</p>{error && <p role="alert">{error}</p>}</div>;

  return <div className="demo-shell">
    <header className="demo-header"><div className="demo-brand"><span className="brand-mark" aria-hidden="true">安</span><strong>安脉</strong></div><div className="header-right"><span>高风险老人 · 模拟佩戴者</span>{publicDemo && <ProviderModePanel onChange={() => void refresh()} />}</div></header>
    <main className="demo-content">
      <div className="demo-title"><div><h1>一次异常体征，系统会怎样响应？</h1><p>跟随这条流程，看到从个人基线、风险判断到亲属接管的每一步。</p></div><span>模拟数据 · 不拨打真实电话</span></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <GuidedDemo dashboard={dashboard} selected={selected} demoInput={lastInput} result={result} busy={busy} wearerId={wearerId} rawInput={input} inputRef={inputRef} onRawInputChange={setInput} onFillNext={() => void fillNextDemoHistory()} onImportRaw={() => void importData()} onSelect={chooseJourney} onImportNext={() => void importNextDemoHistory()} onReset={() => void resetDemo()} onResume={() => void run(() => api.resume(wearerId))} onAction={act} onHelp={() => void run(() => api.help(wearerId))} />
      <details className="advanced-details" id="details"><summary>判断依据、原始记录与演示设置</summary><div className="advanced-grid">
        <section className="advanced-panel"><TimerPanel />{dashboard.baseline && <><h2>当前基线详情</h2>{dashboard.baseline.baseline.observations?.map(item => <p className="observation" key={item.context}>{item.context === 'resting' ? '静息' : item.context === 'activity' ? '活动' : '夜间'} · 心率中位数 {item.heartRate?.median ?? '—'} 次/分 · 血氧中位数 {item.spo2?.median ?? '—'}%</p>)}</>}</section>
        {event && <section className="advanced-panel advanced-wide"><EmergencyCard event={event} card={dashboard.eventCard} contacts={dashboard.contactDeliveries} messages={dashboard.messages} /><EventTimeline eventId={event.eventId} stateVersion={event.stateVersion} />{wearerPrompt && <button onClick={() => speakSimulation(wearerPrompt)}>重播佩戴者警告</button>}{emergencyScript && <button onClick={() => speakSimulation(emergencyScript)}>重播模拟语音</button>}</section>}
      </div></details>
      {result && <p className="demo-result" role="status">{result}</p>}
      <footer>安脉 Agent 原型 · 所有体征、联系人与呼救行为均为模拟</footer>
    </main>
  </div>;
}
