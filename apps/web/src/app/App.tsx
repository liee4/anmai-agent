import { useCallback, useEffect, useState } from 'react';
import { api, type Dashboard } from '../api/client.js';
import { TimerPanel } from './TimerPanel.js';
import { EventTimeline } from './EventTimeline.js';

const wearerId = 'demo-wearer';
const scenarioLabels = { normal: '正常', activity: '轻度活动', abnormal: '持续异常', worsening: '明显恶化', loose_device: '设备松动' } as const;
const stateLabels: Record<string, string> = { wearer_alert: '等待佩戴者回应', safe_recheck: '继续后台检测', primary_contact: '等待主要亲属接管', other_contacts: '等待其他亲属接管', relative_takeover: '亲属已接管', simulated_call: '模拟自动呼救', closed: '事件已结束' };
const riskLabels: Record<string, string> = { normal: '体征平稳', abnormal: '持续异常', worsening: '明显恶化', untrusted_data: '数据不可信', mild: '轻度偏离' };
const reasonLabels: Record<string, string> = { heart_rate_persistent: '心率持续异常', spo2_persistent: '血氧持续异常', blood_pressure_confirmed_twice: '两次血压测量异常', multiple_vitals: '多项体征异常', rest_or_night: '发生在静息或夜间', fixed_heart_rate_high: '心率触及演示固定上限', fixed_heart_rate_low: '心率触及演示固定下限', fixed_spo2_low: '血氧触及演示固定下限', fixed_systolic_high: '血压触及演示固定上限', fixed_systolic_low: '血压触及演示固定下限', device_untrusted_or_invalid: '设备数据质量不足', insufficient_recent_samples: '最近有效采样不足' };

function demoHistory() {
  const data = [];
  const first = Date.UTC(2026, 9, 1);
  for (let day = 0; day < 14; day++) for (let minute = 0; minute < 480; minute++) {
    data.push({ timestamp: new Date(first + day * 86_400_000 + minute * 60_000).toISOString(), heartRate: minute < 120 ? 76 + day % 3 : 91 + day % 4, spo2: 97, activity: minute < 120 ? 'resting' : 'activity' });
  }
  return JSON.stringify({ inputMode: 'auto', wearerId, data });
}

function secondsLeft(deadlineAt: string | null): number | null { return deadlineAt ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000)) : null; }
function speakSimulation(script: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(script);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => { try { setDashboard(await api.dashboard(wearerId)); } catch (failure) { setError(String(failure)); } }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { setNow(Date.now()); void refresh(); }, 1000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const stream = new EventSource(`/api/events/stream?wearerId=${encodeURIComponent(wearerId)}`);
    const update = () => { void refresh(); };
    stream.addEventListener('snapshot', update);
    stream.addEventListener('update', update);
    return () => stream.close();
  }, [refresh]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function importData() {
    await run(async () => {
      const response = await api.ingest(JSON.parse(input));
      setResult(`${response.detectedMode === 'daily' ? '逐日' : '历史'}导入 · 覆盖 ${response.coveredDays} 天 · 有效 ${response.successfulDays} 天 · 完整周期 ${response.completedCycles} 个 · 基线版本 ${response.baselineVersion ?? '尚无'}`);
    });
  }

  const event = dashboard?.event;
  const risk = dashboard?.risk ?? event?.risk;
  const countdown = secondsLeft(event?.deadlineAt ?? null);
  const emergencyScript = event?.state === 'simulated_call' ? `这里是安脉健康监测系统。佩戴者 ${event.wearerId} 出现持续异常体征，佩戴者和绑定亲属均未接管。当前演示位置：${event.location?.name ?? '尚无位置数据'}。请查看屏幕上的紧急事件卡。此通话仅为模拟。` : null;
  const wearerPrompt = event?.state === 'wearer_alert' ? '检测到体征持续异常。请确认您现在是否不舒服。' : null;
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
  void now;

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark" aria-hidden="true">安</span><div><strong>安脉</strong><small>健康监测演示</small></div></div><nav aria-label="页面区域"><a href="#monitor">实时监测</a><a href="#baseline">个人基线</a><a href="#response">应急响应</a><a href="#import">数据导入</a></nav><div className="sidebar-foot">模拟数据 · 非医疗诊断</div></aside>
    <div className="frame"><header className="topbar"><span>高风险老年人群 · 演示佩戴者</span><span className="connection">本地原型</span></header>
      <main className="sheet"><div className="title-row"><div><h1>监测与响应</h1><p>体征异常时先询问佩戴者，再联系亲属；无人接管后进入模拟呼救。</p></div><span className="demo-tag">仅供比赛演示</span></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="main-grid">
          <section id="monitor" className="panel monitor-panel"><div className="panel-heading"><h2>实时监测</h2><span className={`status ${risk?.level ?? 'neutral'}`}>{riskLabels[risk?.level ?? ''] ?? '等待数据'}</span></div>
            <div className="risk-display"><strong>{risk?.score ?? '—'}</strong><span>风险分数</span></div><p className="reason">{risk?.reasons.length ? risk.reasons.map(reason => reasonLabels[reason] ?? reason).join(' · ') : '选择一个模拟场景开始监测。'}</p>
            <div className="scenario-controls" aria-label="模拟场景">{Object.entries(scenarioLabels).map(([key, label]) => <button key={key} disabled={busy} onClick={() => void run(async () => { const response = await api.scenario(wearerId, key); setResult(`${label}场景：${riskLabels[response.risk.level]}`); })}>{label}</button>)}</div>
            <p className="fine-print">判断采用演示阈值与持续时间规则。设备松动时只提示数据质量，不启动应急联系。</p>
          </section>
          <section id="response" className="panel response-panel"><div className="panel-heading"><h2>应急响应</h2><span className={`status ${event?.state ?? 'neutral'}`}>{event ? stateLabels[event.state] : '暂无事件'}</span></div>
            <div className="stage"><span>当前阶段</span><strong>{event ? stateLabels[event.state] : '等待异常体征'}</strong>{countdown !== null && <span className="countdown">剩余 {countdown} 秒</span>}</div>
            {!event && <>{dashboard?.confirmedMonitor && <p className="confirmed-monitor">佩戴者已表示“我没事”，事件已结束，后台继续监测。{dashboard.confirmedMonitor.recheckCount === 0 ? `若异常持续，将于 ${new Date(dashboard.confirmedMonitor.recheckAt).toLocaleTimeString('zh-CN')} 后复查一次。` : '本次连续异常已完成复查，不重复询问。'}</p>}<TimerPanel /></>}
            {event && <><div className="response-actions">{event.state === 'wearer_alert' && <><button className="primary" disabled={busy} onClick={() => void run(() => api.action(event, 'wearer_unwell'))}>我不舒服，需要亲属</button><button disabled={busy} onClick={() => void run(() => api.action(event, 'wearer_safe'))}>我没事</button></>}{(event.state === 'primary_contact' || event.state === 'other_contacts') && <><button className="primary" disabled={busy} onClick={() => void run(() => api.action(event, 'relative_takeover'))}>亲属已接管</button><button disabled={busy} onClick={() => void run(() => api.action(event, 'relative_decline'))}>无法接管</button></>}{event.state === 'relative_takeover' && <button disabled={busy} onClick={() => void run(() => api.action(event, 'close'))}>结束事件</button>}{event.state === 'simulated_call' && <button disabled={busy} onClick={() => void run(() => api.action(event, 'close'))}>结束模拟呼救</button>}</div><div className="event-card"><h3>紧急事件卡</h3><dl><dt>事件编号</dt><dd>{event.eventId.slice(0, 8)}</dd><dt>佩戴者</dt><dd>{event.wearerId}</dd><dt>体征判断</dt><dd>{riskLabels[event.risk.level]}</dd><dt>位置</dt><dd>{event.state === 'wearer_alert' || event.state === 'safe_recheck' ? '进入亲属联系阶段后共享' : event.location?.name ?? '演示位置待提供'}</dd></dl><p>亲属接管后可根据事件卡自行联系急救服务。</p>{emergencyScript && <p className="simulation-script">模拟接线端播报：{emergencyScript}</p>}</div></>}
            {event && (event.state === 'primary_contact' || event.state === 'other_contacts') && event.risk.level !== 'worsening' && dashboard?.baselineState.status !== 'paused' && <button className="late-response" disabled={busy} onClick={() => void run(() => api.action(event, 'wearer_safe'))}>佩戴者现在回应：我没事</button>}
            {wearerPrompt && <button className="late-response" onClick={() => speakSimulation(wearerPrompt)}>重播佩戴者警告</button>}
            {emergencyScript && <button className="late-response" onClick={() => speakSimulation(emergencyScript)}>重播模拟语音</button>}
            {event && <EventTimeline eventId={event.eventId} stateVersion={event.stateVersion} />}
          </section>
          <section id="baseline" className="panel baseline-panel"><div className="panel-heading"><h2>个人基线</h2><span className={`status ${dashboard?.baselineState.status === 'paused' ? 'paused' : 'neutral'}`}>{dashboard?.baselineState.status === 'paused' ? '学习已暂停' : '学习中'}</span></div><div className="baseline-head"><div><span>当前版本</span><strong>{dashboard?.baseline?.version ? `v${dashboard.baseline.version}` : '尚未生成'}</strong></div><div><span>模型 Provider</span><strong>{dashboard?.provider ?? '—'}</strong></div></div><p className="fine-print">本地代码计算观察基线；模型只提出个性化软阈值候选，经安全校验后发布。</p>{dashboard?.baseline?.baseline.observations?.map(item => <div className="observation" key={item.context}><strong>{item.context === 'resting' ? '静息' : item.context === 'activity' ? '活动' : '夜间'}</strong><span>心率中位数 {item.heartRate?.median ?? '—'} 次/分</span><span>血氧中位数 {item.spo2?.median ?? '—'}%</span></div>)}{dashboard?.baselineState.status === 'paused' && <button disabled={busy || Boolean(event)} onClick={() => void run(() => api.resume(wearerId))}>我已恢复，重新开启基线学习</button>}</section>
          <section id="import" className="panel import-panel"><div className="panel-heading"><h2>统一数据输入</h2><span className="section-note">JSON · 自动识别逐日或历史</span></div><label htmlFor="vital-json">体征数据</label><textarea id="vital-json" value={input} onChange={event => setInput(event.target.value)} placeholder='{"inputMode":"auto","wearerId":"demo-wearer","data":[...]}'/><div className="import-actions"><button disabled={busy} onClick={() => setInput(demoHistory())}>填入 14 天演示数据</button><button className="primary" disabled={busy || !input.trim()} onClick={() => void importData()}>导入并检查基线</button></div>{result && <p className="result" role="status">{result}</p>}</section>
        </div><footer>安脉 Agent 原型 · 所有电话、亲属通知与急救行为均为模拟</footer>
      </main>
    </div>
  </div>;
}
