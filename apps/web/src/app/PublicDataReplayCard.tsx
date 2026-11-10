import type { PublicReplay } from '../api/client.js';

export function PublicDataReplayCard({ replay, busy, blocked, onReplay }: { replay: PublicReplay | null; busy: boolean; blocked: boolean; onReplay: (startSecond: number) => void }) {
  const rows = replay?.rows ?? [];
  const missingSpO2 = rows.filter(row => row.spo2 === undefined).length;
  const first = rows[0];
  const last = rows.at(-1);
  return <section className="public-replay" aria-label="真实公开数据回放">
    <div><strong>真实公开数据回放</strong><p>PhysioNet BIDMC v1.0.0 · 记录 bidmc_01 · 医院床旁监护数值，每秒一条。不是居家腕戴设备数据，也没有临床恶化标签。</p></div>
    <div className="public-replay-actions"><button disabled={busy || blocked} onClick={() => onReplay(0)}>回放 0–34 秒</button><button disabled={busy || blocked} onClick={() => onReplay(100)}>回放含缺测片段</button></div>
    {replay && <div className="public-replay-details">
      <p><b>原始测量</b> · {first?.second}–{last?.second} 秒 · 心率 {last?.heartRate === undefined ? '未采集' : `${last.heartRate} 次/分`} · 血氧 {last?.spo2 === undefined ? '未采集' : `${last.spo2}%`} · 血氧缺测 {missingSpO2} 秒。活动、血压、位置未采集。</p>
      <p><b>模拟判断</b> · 系统将原始数值映射到演示时间运行规则；告警与后续联系流程均由原型模拟，不是数据集的结局。</p>
      <a href={replay.source.url} target="_blank" rel="noreferrer">查看 PhysioNet 原始记录与许可</a><span> · {replay.source.license}</span>
    </div>}
  </section>;
}
