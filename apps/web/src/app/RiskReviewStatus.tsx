import type { RiskAssessment, RiskReviewSnapshot } from '@anmai/contracts';

export function RiskReviewStatus({ review, provider, risk, seconds, onHelp, busy }: { review: RiskReviewSnapshot | null; provider: string; risk: RiskAssessment | null; seconds: number | null; onHelp: () => void; busy: boolean }) {
  if (!review || review.status === 'closed' || review.status === 'cancelled') return null;
  const status = review.status === 'observe' ? '模型建议短时观察' : review.status === 'pending' ? '模型正在复核' : '需要佩戴者确认';
  return <div className="review-status" aria-live="polite"><div className="review-head"><strong>{status}</strong><span>复核模型：{provider}</span></div>
    <p>{review.reason ?? (review.fallbackReason ? '模型无法可靠判断，已转入人工确认。' : '等待复核结果。')}{review.status === 'observe' && seconds !== null ? ` · 剩余 ${seconds} 秒` : ''}</p>
    {review.status === 'observe' && risk?.level === 'untrusted_data' && <p>数据中断或质量不足，请检查设备；当前不能确认已经恢复。</p>}
    {review.status === 'observe' && seconds === 0 && <p>尚无新的有效体征，无法确认恢复；请检查设备或主动请求亲属。</p>}
    {(review.status === 'observe' || review.status === 'pending') && <button className="primary" disabled={busy} onClick={onHelp}>我不舒服，需要亲属</button>}
  </div>;
}
