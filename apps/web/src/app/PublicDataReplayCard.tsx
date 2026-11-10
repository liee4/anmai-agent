import type { PublicReplay } from '../api/client.js';

export function PublicDataReplayCard({ replay, busy, blocked, onReplay }: { replay: PublicReplay | null; busy: boolean; blocked: boolean; onReplay: (recordId: '01' | '21' | '32', startSecond: number) => void }) {
  const rows = replay?.rows ?? [];
  const missingSpO2 = rows.filter(row => row.spo2 === undefined).length;
  const first = rows[0];
  const last = rows.at(-1);
  return <section className="public-replay" aria-label="真实公开数据回放">
    <div><strong>真实公开数据回放</strong><p>PhysioNet BIDMC v1.0.0 · 医院床旁监护逐秒数值。可比较缺测、高心率与低血氧原始记录；没有活动或临床恶化标签。</p></div>
    <div className="public-replay-actions"><button disabled={busy || blocked} onClick={() => onReplay('01', 100)}>回放含缺测片段</button><button disabled={busy || blocked} onClick={() => onReplay('21', 100)}>回放真实高心率</button><button disabled={busy || blocked} onClick={() => onReplay('32', 100)}>回放真实低血氧</button></div>
    {replay && <div className="public-replay-details">
      <p><b>原始测量 · {replay.source.recordId}</b> · {first?.second}–{last?.second} 秒 · 心率 {last?.heartRate === undefined ? '未采集' : `${last.heartRate} 次/分`} · 血氧 {last?.spo2 === undefined ? '未采集' : `${last.spo2}%`} · 血氧缺测 {missingSpO2} 秒。活动、血压、位置未采集。</p>
      <p><b>模拟判断</b> · 系统将原始数值映射到演示时间运行规则；告警与后续联系流程均由原型模拟，不是数据集的结局。</p>
      <a href={replay.source.url} target="_blank" rel="noreferrer">查看 PhysioNet 原始记录与许可</a><span> · {replay.source.license}</span>
    </div>}
  </section>;
}
