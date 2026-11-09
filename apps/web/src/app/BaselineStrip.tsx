import type { RefObject } from 'react';
import type { BaselineView, Dashboard } from '../api/client.js';

function cycleRange(cycleId: string): string {
  const startText = cycleId.slice(-10);
  const start = new Date(`${startText}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '周期日期未知';
  const end = new Date(start.getTime() + 13 * 86_400_000);
  return `${startText} — ${end.toISOString().slice(0, 10)}`;
}

function median(baseline: BaselineView | undefined, context: string, field: 'heartRate' | 'spo2'): number | null {
  return baseline?.baseline.observations?.find(item => item.context === context)?.[field]?.median ?? null;
}

function comparison(current: number | null, previous: number | null, unit: string): string {
  if (current === null) return '—';
  return `${current}${previous === null ? '' : `（上轮 ${previous}）`}${unit}`;
}

function weights(baseline: BaselineView | null): string {
  const evidence = baseline?.baseline.evidenceWeights;
  if (!evidence) return '尚无历史基线';
  const current = Math.round(evidence.current * 100);
  const recent = Math.round(evidence.recent.reduce((sum, value) => sum + value, 0) * 100);
  const longTerm = Math.round(evidence.longTerm * 100);
  if (recent === 0 && longTerm === 0) return '首轮：当前 14 天数据 100%';
  return `最新 14 天数据 ${current}% · 历史基线 ${recent}%${longTerm ? ` · 长期摘要 ${longTerm}%` : ''}`;
}

export function BaselineStrip({ dashboard, busy, wearerId, rawInput, inputRef, onRawInputChange, onFillNext, onImportRaw, onImportNext, onReset, onResume }: {
  dashboard: Dashboard;
  busy: boolean;
  wearerId: string;
  rawInput: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onRawInputChange: (value: string) => void;
  onFillNext: () => void;
  onImportRaw: () => void;
  onImportNext: () => void;
  onReset: () => void;
  onResume: () => void;
}) {
  const current = dashboard.baseline;
  const previous = dashboard.baselineHistory.find(item => item.version !== current?.version);
  const paused = dashboard.baselineState.status === 'paused';
  const eventActive = Boolean(dashboard.event);
  const resting = median(current ?? undefined, 'resting', 'heartRate');
  const previousResting = median(previous, 'resting', 'heartRate');
  const activity = median(current ?? undefined, 'activity', 'heartRate');
  const previousActivity = median(previous, 'activity', 'heartRate');
  const spo2 = median(current ?? undefined, 'resting', 'spo2');
  const previousSpo2 = median(previous, 'resting', 'spo2');

  return <section className="baseline-strip" aria-label="个人基线学习进度">
    <div className="baseline-strip-main">
    <div className="baseline-strip-copy">
      <strong>{paused ? '基线学习已暂停' : current ? `当前个人基线 v${current.version}` : '尚未生成个人基线'}</strong>
      <p>{paused ? '佩戴者表示不舒服；事件结束后须本人确认恢复，才能继续学习。' : current ? '每轮演示数据的日期与体征值不同；旧版不会因清空输入框而消失。' : '首次生成需要一个完整、合格的 14 天周期。'}</p>
      {current && <div className="cycle-comparison">
        <span>本轮日期：{cycleRange(current.cycleId)}</span>
        <span>静息心率中位数 {comparison(resting, previousResting, ' 次/分')}</span>
        <span>活动心率中位数 {comparison(activity, previousActivity, ' 次/分')}</span>
        <span>静息血氧中位数 {comparison(spo2, previousSpo2, '%')}</span>
      </div>}
      <div className="memory-detail">{weights(current)}{current && ` · 该版生成模型 ${current.baseline.provider ?? '未知'}`}</div>
      {dashboard.aggregationWarning && <p className="baseline-warning">当前基线使用旧版分钟聚合数据；演示新算法前请重置并重新导入。</p>}
    </div>
    <div className="baseline-strip-actions">
      {paused ? <button disabled={busy || eventActive} onClick={onResume} title={eventActive ? '先结束当前事件' : undefined}>我已恢复，继续学习</button> : <button className="primary" disabled={busy || eventActive} onClick={onImportNext} title={eventActive ? '先结束当前事件' : undefined}>{current ? `继续导入下一轮 14 天（尝试生成 v${current.version + 1}）` : '导入首轮 14 天'}</button>}
      <button disabled={busy} onClick={onReset}>重置演示数据</button>
    </div>
    </div>
    <details className="baseline-manual"><summary>使用自己的 JSON 数据导入基线</summary>
      <p>与一键导入使用同一个数据入口；自动识别逐日数据或历史数据集。</p>
      <label htmlFor="vital-json">体征数据 JSON</label>
      <textarea ref={inputRef} id="vital-json" value={rawInput} onChange={event => onRawInputChange(event.target.value)} placeholder={JSON.stringify({ inputMode: 'auto', wearerId, data: ['...'] })} />
      <div className="import-actions"><button disabled={busy || eventActive || paused} onClick={onFillNext}>填入下一轮 14 天数据</button><button className="primary" disabled={busy || eventActive || paused || !rawInput.trim()} onClick={onImportRaw}>导入并检查基线</button></div>
      {(eventActive || paused) && <p>当前事件或基线暂停期间不能导入；结束事件并确认恢复后再继续。</p>}
    </details>
  </section>;
}
