import { createHash, randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { RiskReviewDecisionSchema, type RiskReviewDecision, type RiskReviewSnapshot, type RiskAssessment, type VitalSample } from '@anmai/contracts';
import type { Clock } from '../../clock.js';
import type { DatabaseContext } from '../../infra/database.js';
import type { PersonalBaseline } from './risk-detector.js';
import type { RiskReviewProvider, RiskReviewRequest, ReviewVital } from './risk-review-provider.js';
import { knowledgeForRisk } from '../knowledge/evidence-library.js';

interface ReviewRow {
  generation: number;
  status: RiskReviewSnapshot['status'];
  provider: string;
  decision: RiskReviewDecision['decision'] | null;
  reason: string | null;
  deadline_at: string | null;
  fallback_reason: string | null;
  last_risk_json: string | null;
  last_sample_json: string | null;
}
export type ReviewAction = 'ask' | 'observe' | 'stale';

export class RiskReviewService {
  constructor(private readonly db: DatabaseContext, private readonly clock: Clock, private readonly provider: RiskReviewProvider, readonly providerName: string | ((wearerId: string) => string), private observationSeconds = 30) {
    if (!Number.isInteger(observationSeconds) || observationSeconds < 1) throw new Error('Observation seconds must be positive');
  }

  getSettings(): { observationSeconds: number } { return { observationSeconds: this.observationSeconds }; }

  setObservationSeconds(seconds: number): boolean {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return false;
    if (this.db.raw.prepare("SELECT 1 FROM risk_review_state WHERE status IN ('pending','observe') LIMIT 1").get()) return false;
    this.observationSeconds = seconds;
    return true;
  }

  get(wearerId: string): RiskReviewSnapshot | null {
    const row = this.row(wearerId);
    return row ? { status: row.status, provider: row.provider, decision: row.decision, reason: row.reason, deadlineAt: row.deadline_at, fallbackReason: row.fallback_reason } : null;
  }

  getLastObservation(wearerId: string): { risk: RiskAssessment; sample: VitalSample } | null {
    const row = this.row(wearerId);
    return row?.last_risk_json && row.last_sample_json ? { risk: JSON.parse(row.last_risk_json) as RiskAssessment, sample: JSON.parse(row.last_sample_json) as VitalSample } : null;
  }

  cancel(wearerId: string): void { this.end(wearerId, 'cancelled', this.clock.now().toISOString()); }

  async assess(wearerId: string, risk: RiskAssessment, samples: VitalSample[], baselineVersion: number | null, baseline: PersonalBaseline): Promise<{ action: ReviewAction; snapshot: RiskReviewSnapshot | null }> {
    const now = this.clock.now().toISOString();
    const current = this.row(wearerId);
    if (risk.level === 'worsening') {
      this.end(wearerId, 'cancelled', now);
      return { action: 'ask', snapshot: this.get(wearerId) };
    }
    if (risk.level === 'normal') {
      this.end(wearerId, 'closed', now);
      return { action: 'stale', snapshot: this.get(wearerId) };
    }
    if (risk.level === 'untrusted_data') return { action: 'stale', snapshot: this.get(wearerId) };
    if (!baselineVersion || !samples.length) return { action: 'ask', snapshot: current ? this.get(wearerId) : null };
    if (current?.status === 'asked') return { action: 'ask', snapshot: this.get(wearerId) };
    if (current?.status === 'observe') {
      this.db.raw.prepare('UPDATE risk_review_state SET last_risk_json=?,last_sample_json=?,updated_at=? WHERE wearer_id=?').run(JSON.stringify(risk), JSON.stringify(samples.at(-1)), now, wearerId);
      if (current.deadline_at && Date.parse(now) < Date.parse(current.deadline_at)) return { action: 'observe', snapshot: this.get(wearerId) };
      this.db.raw.prepare("UPDATE risk_review_state SET status = 'asked', fallback_reason = 'observation_expired', updated_at = ? WHERE wearer_id = ?").run(now, wearerId);
      return { action: 'ask', snapshot: this.get(wearerId) };
    }
    if (current?.status === 'pending') return { action: 'observe', snapshot: this.get(wearerId) };

    const generation = (current?.generation ?? 0) + 1;
    const compact = (sample: VitalSample): ReviewVital => ({ timestamp: sample.timestamp, activity: sample.activity,
      ...(sample.heartRate === undefined ? {} : { heartRate: sample.heartRate }),
      ...(sample.spo2 === undefined ? {} : { spo2: sample.spo2 }),
      ...(sample.systolicBP === undefined ? {} : { systolicBP: sample.systolicBP }),
      ...(sample.diastolicBP === undefined ? {} : { diastolicBP: sample.diastolicBP }),
      ...(sample.deviceTrusted === undefined ? {} : { deviceTrusted: sample.deviceTrusted }),
    });
    const recent = samples.filter(sample => Date.parse(risk.assessedAt) - Date.parse(sample.timestamp) <= 60_000).slice(-60).map(compact);
    const request: RiskReviewRequest = { wearerId, risk, latest: compact(samples.at(-1)!), recent, baselineVersion, baseline, knowledge: knowledgeForRisk(risk) };
    const providerName = typeof this.providerName === 'function' ? this.providerName(wearerId) : this.providerName;
    const inputHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    this.db.raw.prepare('INSERT INTO risk_review_state(wearer_id,generation,status,provider,decision,reason,deadline_at,fallback_reason,last_risk_json,last_sample_json,updated_at) VALUES (?,?,\'pending\',?,NULL,NULL,NULL,NULL,?,?,?) ON CONFLICT(wearer_id) DO UPDATE SET generation=excluded.generation,status=excluded.status,provider=excluded.provider,decision=NULL,reason=NULL,deadline_at=NULL,fallback_reason=NULL,last_risk_json=excluded.last_risk_json,last_sample_json=excluded.last_sample_json,updated_at=excluded.updated_at').run(wearerId, generation, providerName, JSON.stringify(risk), JSON.stringify(samples.at(-1)), now);

    let decision: RiskReviewDecision | null = null;
    let fallbackReason: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([this.provider.review(request), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5_000); })]);
      if (!Value.Check(RiskReviewDecisionSchema, output)) fallbackReason = 'invalid_decision';
      else decision = output;
    } catch (error) { fallbackReason = error instanceof Error && error.message === 'timeout' ? 'timeout' : 'provider_error'; }
    finally { if (timer) clearTimeout(timer); }
    const latest = this.row(wearerId);
    if (!latest || latest.generation !== generation || latest.status !== 'pending') return { action: 'stale', snapshot: this.get(wearerId) };
    if (decision?.decision === 'uncertain') fallbackReason = 'uncertain';
    const observe = decision?.decision === 'observe' && !fallbackReason;
    const deadline = observe ? new Date(this.clock.now().getTime() + this.observationSeconds * 1000).toISOString() : null;
    this.db.transaction(() => {
      this.db.raw.prepare('UPDATE risk_review_state SET status=?, decision=?, reason=?, deadline_at=?, fallback_reason=?, updated_at=? WHERE wearer_id=? AND generation=? AND status=\'pending\'').run(observe ? 'observe' : 'asked', decision?.decision ?? null, decision?.reason ?? null, deadline, fallbackReason, this.clock.now().toISOString(), wearerId, generation);
      this.db.raw.prepare('INSERT INTO risk_review_audit(id,wearer_id,generation,provider,decision,reason,fallback_reason,input_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), wearerId, generation, providerName, decision?.decision ?? null, decision?.reason ?? null, fallbackReason, inputHash, this.clock.now().toISOString());
    });
    return { action: observe ? 'observe' : 'ask', snapshot: this.get(wearerId) };
  }

  private row(wearerId: string): ReviewRow | undefined {
    return this.db.raw.prepare('SELECT generation,status,provider,decision,reason,deadline_at,fallback_reason,last_risk_json,last_sample_json FROM risk_review_state WHERE wearer_id=?').get(wearerId) as ReviewRow | undefined;
  }

  private end(wearerId: string, status: 'closed' | 'cancelled', now: string): void {
    const row = this.row(wearerId);
    if (!row || row.status === status) return;
    this.db.raw.prepare('UPDATE risk_review_state SET generation=?, status=?, deadline_at=NULL, updated_at=? WHERE wearer_id=?').run(row.generation + 1, status, now, wearerId);
  }
}
