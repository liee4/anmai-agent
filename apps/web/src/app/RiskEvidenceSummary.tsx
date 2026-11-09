import type { RiskAssessment } from '@anmai/contracts';

const trendLabels = { none: '', heart_rate_rising: '心率继续上升', heart_rate_falling: '心率继续下降', spo2_falling: '血氧继续下降' };

export function RiskEvidenceSummary({ risk }: { risk: RiskAssessment }) {
  const evidence = risk.evidence;
  if (!evidence) return null;
  const heart = evidence.quality.heartRate === 'valid'
    ? `心率有效${evidence.values.heartRate === undefined ? '' : ` · ${evidence.values.heartRate} 次/分`} · 最近覆盖 ${evidence.coverageSeconds.heartRate}/10 秒 · 持续异常 ${evidence.abnormalSeconds.heartRate}/30 秒`
    : evidence.quality.heartRate === 'missing' ? '心率未采集' : '心率数据可疑，请检查设备';
  const oxygen = evidence.quality.spo2 === 'valid'
    ? `血氧有效${evidence.values.spo2 === undefined ? '' : ` · ${evidence.values.spo2}%`} · 最近覆盖 ${evidence.coverageSeconds.spo2}/10 秒 · 持续异常 ${evidence.abnormalSeconds.spo2}/30 秒`
    : evidence.quality.spo2 === 'missing' ? '血氧未采集' : '血氧数据可疑，请检查设备';
  const pressure = evidence.quality.bloodPressure === 'valid'
    ? `血压读数有效${evidence.values.systolicBP === undefined ? '' : ` · 收缩压 ${evidence.values.systolicBP}`}`
    : evidence.quality.bloodPressure === 'suspect' ? '血压读数可疑，请重新测量' : '本次没有血压读数';
  return <div className="risk-evidence-summary" aria-label="逐项判断依据">
    <p>{heart}</p><p>{oxygen}</p><p>{pressure}</p>
    {evidence.trend !== 'none' && <p>{trendLabels[evidence.trend]}</p>}
    {evidence.fixedBoundary && <p>触及演示固定边界，直接升级</p>}
  </div>;
}
