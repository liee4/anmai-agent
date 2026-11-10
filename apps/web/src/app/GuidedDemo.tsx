import type { RefObject } from 'react';
import type { Dashboard, DemoInput, PublicReplay, WearerTextInterpretation } from '../api/client.js';
import { BaselineStrip } from './BaselineStrip.js';
import { RiskReviewStatus } from './RiskReviewStatus.js';
import { RiskEvidenceSummary } from './RiskEvidenceSummary.js';
import { PublicDataReplayCard } from './PublicDataReplayCard.js';
import { WearerTextReply } from './WearerTextReply.js';

export type Journey = 'baseline' | 'rest' | 'activity' | 'responsive' | 'noanswer' | 'worsening' | 'device' | 'publicdata';

const journeys: { key: Journey; label: string; description: string }[] = [
  { key: 'baseline', label: '个人基线', description: '14 天历史数据形成个性化软阈值，固定安全阈值保持不变。' },
  { key: 'rest', label: '正常静息', description: '体征平稳：继续监测，不询问佩戴者。' },
  { key: 'activity', label: '正常活动', description: '心率随活动升高：结合活动标记判断，避免误报。' },
  { key: 'responsive', label: '异常 · 有回应', description: '普通异常经模型复核后询问；本人可选“没事”或“不舒服”。' },
  { key: 'noanswer', label: '异常 · 无回应', description: '提醒到期仍无回应：依次联系亲属，无人接管才模拟呼救。' },
  { key: 'worsening', label: '明显恶化', description: '触及固定安全边界：警告佩戴者并立即联系主要亲属，跳过模型等待。' },
  { key: 'device', label: '设备松动', description: '数据不可信：提示检查设备，不启动亲属联系。' },
  { key: 'publicdata', label: '真实数据回放', description: '回放 PhysioNet 的原始测量值；系统判断和应急流程仍是模拟。' },
];

const stateLabels: Record<string, string> = {
  wearer_alert: '等待佩戴者回应', safe_recheck: '继续后台检测', primary_contact: '等待主要亲属接管', other_contacts: '等待其他亲属接管', relative_takeover: '亲属已接管', simulated_call: '模拟自动呼救', closed: '事件已结束',
};
const riskLabels: Record<string, string> = { normal: '体征平稳', abnormal: '持续异常', worsening: '明显恶化', untrusted_data: '数据不可信', mild: '轻度偏离' };
const reasonLabels: Record<string, string> = {
  heart_rate_persistent: '心率持续异常', spo2_persistent: '血氧持续异常', blood_pressure_confirmed_twice: '两次血压测量异常', clear_worsening_trend: '持续异常后进一步明显恶化', activity_unknown: '活动状态未知，暂不使用个人基线', fixed_heart_rate_high: '心率触及演示固定上限', fixed_heart_rate_low: '心率触及演示固定下限', fixed_spo2_low: '血氧触及演示固定下限', fixed_systolic_high: '血压触及演示固定上限', fixed_systolic_low: '血压触及演示固定下限', device_untrusted_or_invalid: '设备数据质量不足', insufficient_recent_samples: '最近有效采样不足',
};
const flowNames = ['建立个人基线', '输入实时体征', '判断并询问佩戴者', '联系亲属或模拟呼救'];

function secondsLeft(deadlineAt: string | null): number | null {
  return deadlineAt ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000)) : null;
}

function stageOf(dashboard: Dashboard, selected: Journey): number {
  const state = dashboard.event?.state;
  if (state === 'wearer_alert') return 2;
  if (state && state !== 'safe_recheck' && state !== 'closed') return 3;
  if (dashboard.riskReview && !['closed', 'cancelled'].includes(dashboard.riskReview.status)) return 2;
  if (selected === 'publicdata') return 1;
  if (!dashboard.baseline && selected === 'baseline') return 0;
  return 1;
}

function flowState(index: number, stage: number, hasBaseline: boolean, severe: boolean): { className: string; label: string } {
  if (index === 0 && !hasBaseline && stage > 0) return { className: 'skipped', label: '尚未建立' };
  if (index === 2 && severe && stage === 3) return { className: 'skipped', label: '安全规则直达' };
  if (index === stage) return { className: 'current', label: '当前步骤' };
  if (index < stage) return { className: 'done', label: '已完成' };
  return { className: '', label: '等待进行' };
}

function scenarioPreset(key: Journey, input: DemoInput | null, replay: PublicReplay | null): string | null {
  if (key === 'publicdata') return `PhysioNet BIDMC ${replay?.source.recordId ?? '原始记录'}：真实床旁监护数值，活动与血压未采集`;
  if (input && key !== 'baseline') return `本次模拟输入：心率 ${input.heartRate} 次/分 · 血氧 ${input.spo2}%${input.activity === 'activity' ? ' · 活动标记' : ''}`;
  if (key === 'rest') return '演示预设：静息体征按当前基线生成';
  if (key === 'activity') return '演示预设：活动体征按当前基线生成';
  if (key === 'responsive' || key === 'noanswer') return '演示预设：心率 112 次/分 · 持续 35 秒';
  if (key === 'worsening') return '演示预设：心率 142 次/分 · 血氧 90%';
  if (key === 'device') return '演示预设：设备松动 · 数据不可信';
  return null;
}

function statusText(dashboard: Dashboard, selected: Journey, result: string): string {
  const event = dashboard.event;
  if (event?.state === 'wearer_alert') return selected === 'noanswer' ? '已提醒佩戴者；保持无回应，倒计时结束后会联系主要亲属。' : '已提醒佩戴者，请根据实际感受选择回应。';
  if (event?.state === 'primary_contact') return '正在联系主要亲属，亲属可通过事件卡了解情况。';
  if (event?.state === 'other_contacts') return '主要亲属未接管，正在联系其他亲属。';
  if (event?.state === 'relative_takeover') return '亲属已接管，可根据事件卡自行联系急救服务。';
  if (event?.state === 'simulated_call') return '亲属均未接管，进入模拟呼救；不会真的拨号。';
  const review = dashboard.riskReview;
  if (review?.status === 'observe' && dashboard.risk?.level === 'untrusted_data') return '当前设备数据不可信；此前异常观察仍在进行，需检查设备或提供新的有效数据。';
  if (review?.status === 'observe') return '规则发现普通异常，模型建议短时观察；佩戴者可随时求助。';
  if (review?.status === 'pending') return '规则发现普通异常，模型正在复核。';
  if (dashboard.confirmedMonitor) return '佩戴者表示“我没事”，事件结束，后台继续检测。';
  if (result) return result;
  if (dashboard.risk?.level === 'untrusted_data') return '设备数据不可信，请检查佩戴状态。';
  if (dashboard.risk?.level === 'normal') return '体征平稳，继续监测。';
  return dashboard.baseline ? '个人基线已建立，选择患者情景或输入一段实时体征。' : '先导入 14 天模拟历史数据，建立个人基线。';
}

export function GuidedDemo({ dashboard, selected, demoInput, publicReplay, result, busy, wearerId, rawInput, inputRef, onRawInputChange, onFillNext, onImportRaw, onSelect, onPublicReplay, onImportNext, onReset, onResume, onAction, onInterpretWearerText, onHelp }: {
  dashboard: Dashboard;
  selected: Journey;
  demoInput: DemoInput | null;
  publicReplay: PublicReplay | null;
  result: string;
  busy: boolean;
  wearerId: string;
  rawInput: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onRawInputChange: (value: string) => void;
  onFillNext: () => void;
  onImportRaw: () => void;
  onSelect: (journey: Journey) => void;
  onPublicReplay: (recordId: '01' | '21' | '32', startSecond: number) => void;
  onImportNext: () => void;
  onReset: () => void;
  onResume: () => void;
  onAction: (kind: string) => void;
  onInterpretWearerText: (eventId: string, text: string) => Promise<WearerTextInterpretation>;
  onHelp: () => void;
}) {
  const event = dashboard.event;
  const review = dashboard.riskReview;
  const risk = dashboard.risk ?? event?.risk;
  const stage = stageOf(dashboard, selected);
  const reviewSeconds = secondsLeft(review?.deadlineAt ?? null);
  const eventSeconds = secondsLeft(event?.deadlineAt ?? null);
  const preset = scenarioPreset(selected, demoInput, publicReplay);
  const activeReview = Boolean(review && !['closed', 'cancelled'].includes(review.status));
  const resting = dashboard.baseline?.baseline.observations?.find(item => item.context === 'resting');
  const activity = dashboard.baseline?.baseline.observations?.find(item => item.context === 'activity');
  const normalHeartRate = Math.round(resting?.heartRate?.median ?? 78);
  const activityHeartRate = Math.round(activity?.heartRate?.median ?? 92) + 2;
  const normalSpo2 = Math.round(resting?.spo2?.median ?? 97);
  const activitySpo2 = Math.round(activity?.spo2?.median ?? 97);
  const blocked = Boolean(event);
  const modelStep = risk?.level === 'worsening' ? '明显恶化：按安全规则跳过模型等待' : risk?.level === 'untrusted_data' && activeReview ? '此前异常已由模型复核；当前设备数据不可信' : risk?.level === 'normal' || risk?.level === 'untrusted_data' ? '规则未确认普通异常，无需模型复核' : `普通异常：${dashboard.riskReviewProvider} 复核并说明理由`;
  const logic = [
    ['接收体征', selected === 'publicdata' ? '回放有来源的真实监护数值' : '模拟穿戴设备持续传入心率与血氧'],
    ['规则判断', '检查数据质量、持续时间与阈值'],
    ['模型复核', modelStep],
    ['询问佩戴者', selected === 'noanswer' ? '提醒到期仍无回应，随后联系亲属' : '不舒服可立即进入亲属联系'],
    ['分级联系', '主要亲属 → 其他亲属 → 模拟呼救'],
  ];
  const reasons = risk?.reasons.map(reason => reasonLabels[reason] ?? reason).join(' · ');
  const riskTitle = risk?.level === 'normal' && risk.reasons.includes('activity_unknown') ? '活动状态未知，继续监测'
    : risk?.level === 'normal' && risk.evidence && (risk.evidence.quality.heartRate !== 'valid' || risk.evidence.quality.spo2 !== 'valid') ? '部分体征未确认'
      : risk ? riskLabels[risk.level] ?? risk.level : '体征已处理';
  const latest = dashboard.eventCard?.latest;

  return <>
    <section className="journeys" aria-label="患者情景">
      <div className="journeys-head"><h2>选择患者情景</h2><p>现场讲解可依次演示；评委也可直接进入任一情景</p></div>
      <div className="journey-options">{journeys.map(journey => <button key={journey.key} className={selected === journey.key ? 'active' : ''} aria-pressed={selected === journey.key} disabled={busy || (blocked && journey.key !== 'baseline' && journey.key !== 'worsening')} onClick={() => onSelect(journey.key)}>{journey.label}</button>)}</div>
      <p className="journey-desc">{journeys.find(item => item.key === selected)?.description}{blocked && ' · 当前事件进行中，可结束事件或重置后切换其他情景。'}</p>
    </section>

    <BaselineStrip dashboard={dashboard} busy={busy} wearerId={wearerId} rawInput={rawInput} inputRef={inputRef} onRawInputChange={onRawInputChange} onFillNext={onFillNext} onImportRaw={onImportRaw} onImportNext={onImportNext} onReset={onReset} onResume={onResume} />

    <PublicDataReplayCard replay={publicReplay} busy={busy} blocked={blocked} onReplay={onPublicReplay} />

    <div className="demo-flow" aria-label="演示进度">{flowNames.map((name, index) => { const state = flowState(index, stage, Boolean(dashboard.baseline), risk?.level === 'worsening'); return <div key={name} className={state.className}><small>{state.label}</small><strong>{name}</strong></div>; })}</div>

    <div className="guided-body">
      <section className="guided-main" aria-live="polite">
        {stage === 0 && <>
          <p className="eyebrow">开始演示</p><h2>先建立佩戴者的个人基线</h2>
          <p className="lead">一键导入 14 天模拟历史数据。系统按天汇总，再由当前模型提出个性化软阈值候选，经过代码校验后发布。</p>
          <p className="guided-note">点击上方“导入首轮 14 天”，或展开同一区域，用自己的 JSON 数据导入。</p>
          <div className="evidence"><h3>这一步完成后会看到</h3><dl><dt>输入</dt><dd>14 天模拟体征；统一入口自动识别历史导入</dd><dt>输出</dt><dd>有效天数、基线版本、个人参考值与上轮对比</dd><dt>模型</dt><dd>{dashboard.provider}；发布结果由后端安全校验决定</dd></dl></div>
        </>}
        {stage === 1 && <>
          <p className="eyebrow">{dashboard.baseline ? `基线 v${dashboard.baseline.version} 由 ${dashboard.baseline.baseline.provider ?? '未知模型'} 生成` : '尚无个人基线'} · 当前模型 {dashboard.provider}</p>
          <h2>{risk && selected !== 'baseline' ? riskTitle : '输入一段模拟实时体征'}</h2>
          <p className="lead">{preset ?? '选一个场景。页面会显示预设输入、实际规则结果和系统采取的下一步动作。'}</p>
          {risk && selected !== 'baseline' && <div className={`risk-result ${risk.level}`}><strong>规则结果：{riskTitle}</strong><span>判断依据：{reasons || '未达到异常条件'}</span><RiskEvidenceSummary risk={risk} />{risk.level === 'untrusted_data' && <span>请检查设备；不会启动亲属联系。</span>}</div>}
          {dashboard.confirmedMonitor && <p className="confirmed-monitor">佩戴者已表示“我没事”，后台继续监测；若进一步明显恶化仍会升级。</p>}
          <div className="scenario-grid">
            <button disabled={busy || blocked} onClick={() => onSelect('rest')}><strong>平稳体征</strong><span>心率 {normalHeartRate} 次/分 · 血氧 {normalSpo2}%</span></button>
            <button disabled={busy || blocked} onClick={() => onSelect('activity')}><strong>轻度活动</strong><span>心率 {activityHeartRate} 次/分 · 血氧 {activitySpo2}% · 有活动标记</span></button>
            <button disabled={busy || blocked} onClick={() => onSelect('responsive')}><strong>持续异常</strong><span>心率 112 次/分 · 持续 35 秒</span></button>
            <button disabled={busy} onClick={() => onSelect('worsening')}><strong>输入明显恶化体征</strong><span>心率 142 次/分 · 血氧 90%</span></button>
            <button disabled={busy || blocked} onClick={() => onSelect('device')}><strong>设备松动</strong><span>数据不可信，只提示检查设备</span></button>
          </div>
          <div className="evidence"><h3>个人基线与判断依据</h3><dl><dt>基线</dt><dd>{dashboard.baseline ? `v${dashboard.baseline.version} · ${dashboard.baseline.cycleId.slice(-10)} 起的 14 天` : '尚未生成，使用通用演示规则'}</dd><dt>规则判断</dt><dd>{reasons || '等待实时体征'}</dd><dt>模型复核</dt><dd>{risk?.level === 'normal' || risk?.level === 'untrusted_data' ? '未调用' : dashboard.riskReview?.reason ?? '等待普通异常'}</dd></dl></div>
        </>}
        {stage === 2 && <>
          <p className="eyebrow">{event ? '正在询问佩戴者' : '规则检测与模型复核'}</p>
          <h2>{event ? '异常仍在持续，请佩戴者确认状态' : risk?.level === 'untrusted_data' ? '当前设备数据不可信，观察仍在进行' : review?.status === 'observe' ? '持续异常，模型建议短时观察' : '普通异常，模型正在复核'}</h2>
          <p className="lead">{preset ? `${preset} · ` : ''}{reasons || '等待更多有效体征'}</p>
          {risk && <RiskEvidenceSummary risk={risk} />}
          {event ? <>
            <div className="guided-actions"><button className="primary" disabled={busy} onClick={() => onAction('wearer_unwell')}>我不舒服，需要亲属</button><button disabled={busy} onClick={() => onAction('wearer_safe')}>我没事，继续后台检测</button></div>
            <WearerTextReply key={`${event.eventId}:${event.stateVersion}`} busy={busy} onInterpret={text => onInterpretWearerText(event.eventId, text)} onConfirm={onAction} />
            {selected === 'noanswer' && <p className="guided-note">此情景请保持无回应。提醒倒计时结束后，系统会自动联系主要亲属。</p>}
            {eventSeconds !== null && <p className="countdown">佩戴者回应剩余 {eventSeconds} 秒</p>}
          </> : <>
            <RiskReviewStatus review={review} risk={risk ?? null} seconds={reviewSeconds} busy={busy} onHelp={onHelp} />
            {review?.status === 'observe' && <div className="guided-actions"><button disabled={busy || (reviewSeconds !== null && reviewSeconds > 0)} onClick={() => onSelect(selected === 'noanswer' ? 'noanswer' : 'responsive')}>观察结束后，再输入持续异常</button></div>}
          </>}
          <div className="evidence"><h3>系统给出这个动作的依据</h3><dl><dt>规则检测</dt><dd>{reasons || '心率连续偏离个人参考值'}</dd><dt>模型复核</dt><dd>{review ? `${review.provider}：${review.reason ?? review.fallbackReason ?? '正在处理'}` : '已进入佩戴者询问'}</dd><dt>人工参与</dt><dd>{event ? '等待佩戴者反馈' : '观察期间可主动要求联系亲属'}</dd></dl></div>
        </>}
        {stage === 3 && event && <>
          <p className="eyebrow">已进入应急响应</p><h2>{stateLabels[event.state] ?? event.state}</h2>
          <p className="lead">{risk?.level === 'worsening' ? risk.evidence?.fixedBoundary ? '体征触及演示固定边界，已跳过模型等待。' : '持续异常后进一步明显恶化，已跳过模型等待。' : '佩戴者表示不舒服或未回应，按顺序联系亲属。'}{eventSeconds !== null ? ` 当前阶段剩余 ${eventSeconds} 秒。` : ''}</p>
          <div className="guided-actions">
            {(event.state === 'primary_contact' || event.state === 'other_contacts') && <><button className="primary" disabled={busy} onClick={() => onAction('relative_takeover')}>亲属已接管</button><button disabled={busy} onClick={() => onAction('relative_decline')}>无法接管，联系下一位</button></>}
            {(event.state === 'relative_takeover' || event.state === 'simulated_call') && <button className="primary" disabled={busy} onClick={() => onAction('close')}>结束模拟事件</button>}
          </div>
          {event.state === 'primary_contact' && risk?.level !== 'worsening' && dashboard.baselineState.status !== 'paused' && <button className="late-response" disabled={busy} onClick={() => onAction('wearer_safe')}>佩戴者现在回应：我没事</button>}
          <div className="evidence"><h3>紧急事件卡摘要</h3><dl><dt>当前体征</dt><dd>{latest ? `心率 ${latest.heartRate ?? '—'} 次/分 · 血氧 ${latest.spo2 ?? '—'}%` : '暂无可用数据'}</dd><dt>佩戴者反馈</dt><dd>{dashboard.eventCard?.wearerFeedback ?? '未回应'}</dd><dt>位置</dt><dd>{event.location?.name ?? '尚无位置数据'}</dd></dl></div>
        </>}
      </section>

      <aside className="guided-aside"><h3>系统正在做什么</h3><ol className="logic">{logic.map(([name, description], index) => { const skipped = index === 2 && (risk?.level === 'worsening' || (risk?.level === 'normal' || risk?.level === 'untrusted_data') && !activeReview); const active = index === (stage === 0 ? -1 : stage === 1 ? 0 : stage === 2 ? event ? 3 : 2 : 4); const complete = index < (stage === 0 ? 0 : stage === 1 ? 0 : stage === 2 ? 2 : 4); return <li key={name} className={skipped ? 'skipped' : active ? 'active' : complete ? 'complete' : ''}><strong>{name}</strong><span>{description}</span></li>; })}</ol>
        <p className="statusline" role="status">{statusText(dashboard, selected, result)}</p>
        {dashboard.knowledge.length > 0 && <div className="knowledge-sources"><strong>参考知识 · v{dashboard.knowledge[0]?.version}</strong><small>来源已核对，待临床审核；只供解释，不改变告警阈值。</small>{dashboard.knowledge.map(item => <a key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title} · {item.sourcePublisher}</a>)}</div>}
        {dashboard.contactDeliveries.length > 0 && <div className="delivery-summary"><strong>模拟联系进度</strong>{dashboard.contactDeliveries.map(delivery => <span key={delivery.contactId}>{delivery.label}：{delivery.status === 'delivered' ? '已送达' : delivery.status === 'taken_over' ? '已接管' : delivery.status === 'declined' ? '无法接管' : delivery.status === 'delivery_failed' ? '送达失败' : '超时'}</span>)}</div>}
        <button className="details-link" onClick={() => { const details = document.getElementById('details') as HTMLDetailsElement | null; if (details) { details.open = true; details.scrollIntoView({ behavior: 'smooth' }); } }}>查看原始记录与演示设置</button>
      </aside>
    </div>
  </>;
}
