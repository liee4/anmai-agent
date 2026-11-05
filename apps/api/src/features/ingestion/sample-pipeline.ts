import { randomUUID } from 'node:crypto';
import type { RiskAssessment, VitalSample } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';
import { BaselineExclusionRepository } from '../../infra/repositories/baseline-exclusion-repository.js';
import { DailySummaryRepository } from '../../infra/repositories/daily-summary-repository.js';
import { demoThresholds } from '../monitoring/detection-config.js';
import { RiskDetector, type PersonalBaseline } from '../monitoring/risk-detector.js';
import { median } from '../monitoring/sliding-window.js';
import { buildDailySummary } from './daily-summary-builder.js';
import type { NormalizedSample } from './normalizer.js';

export type SampleSource = 'daily' | 'history' | 'live' | 'scenario';

export class SamplePipeline {
  private readonly exclusions: BaselineExclusionRepository;
  private readonly summaries: DailySummaryRepository;

  constructor(private readonly db: DatabaseContext) {
    this.exclusions = new BaselineExclusionRepository(db);
    this.summaries = new DailySummaryRepository(db);
  }

  store(wearerId: string, samples: NormalizedSample[], source: SampleSource): { duplicateSamples: number; excludedSamples: number } {
    if (source === 'scenario') return { duplicateSamples: 0, excludedSamples: samples.length };
    return this.db.transaction(() => {
      const state = this.db.raw.prepare('SELECT status FROM baseline_state WHERE wearer_id = ?').get(wearerId) as { status: string } | undefined;
      const paused = state?.status === 'paused';
      let duplicateSamples = 0;
      let excludedSamples = 0;
      const affectedDates = new Set<string>();
      for (const sample of samples) {
        const inserted = this.db.raw.prepare('INSERT OR IGNORE INTO ingested_samples(wearer_id, sampled_at, sample_json) VALUES (?, ?, ?)').run(wearerId, sample.instant, JSON.stringify(sample));
        if (!inserted.changes) { duplicateSamples++; continue; }
        affectedDates.add(sample.localDate);
        const acute = (sample.heartRate !== undefined && (sample.heartRate > demoThresholds.heartRateUpper || sample.heartRate < demoThresholds.heartRateLower)) || (sample.spo2 !== undefined && sample.spo2 < demoThresholds.spo2Lower) || (sample.systolicBP !== undefined && (sample.systolicBP > demoThresholds.systolicBPUpper || sample.systolicBP < demoThresholds.systolicBPLower));
        if (acute) this.insertRiskAudit(wearerId, sample, source, 'acute_anomaly', []);
        const reasons = [paused && 'baseline_paused', acute && 'acute_anomaly', ...this.exclusions.reasonsAt(wearerId, sample.instant), sample.deviceTrusted === false && 'device_untrusted', sample.activity === 'unknown' && 'activity_unknown', (sample.heartRate === undefined || sample.spo2 === undefined) && 'missing_value'].filter((reason): reason is string => typeof reason === 'string');
        if (reasons.length) excludedSamples++;
        this.refreshMinute(wearerId, sample, reasons);
      }
      for (const date of affectedDates) this.refreshDay(wearerId, date, paused);
      return { duplicateSamples, excludedSamples };
    });
  }

  recordAnomaly(eventId: string, samples: VitalSample[]): void {
    this.db.transaction(() => {
      for (const sample of samples) {
        this.db.raw.prepare('INSERT OR IGNORE INTO anomaly_snippets(id, event_id, at, sample_json) VALUES (?, ?, ?, ?)').run(randomUUID(), eventId, new Date(sample.timestamp).toISOString(), JSON.stringify(sample));
      }
    });
  }

  auditRisk(wearerId: string, samples: VitalSample[], source: SampleSource, risk: RiskAssessment): void {
    if (!samples.length || (risk.level !== 'abnormal' && risk.level !== 'worsening')) return;
    const ordered = [...samples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    this.db.transaction(() => {
      for (const sample of ordered) this.insertRiskAudit(wearerId, sample, source, `risk_${risk.level}`, risk.reasons);
      this.exclusions.excludeRange(wearerId, ordered[0]!.timestamp, ordered.at(-1)!.timestamp, `risk_${risk.level}`);
    });
  }

  scanImportedRisk(wearerId: string, samples: NormalizedSample[], source: 'daily' | 'history', baseline: PersonalBaseline): void {
    if (!samples.length) return;
    const detector = new RiskDetector();
    const from = new Date(Date.parse(samples[0]!.instant) - 40_000).toISOString();
    const stored = this.db.raw.prepare('SELECT sample_json FROM ingested_samples WHERE wearer_id = ? AND sampled_at BETWEEN ? AND ? ORDER BY sampled_at').all(wearerId, from, samples.at(-1)!.instant) as { sample_json: string }[];
    const recent: NormalizedSample[] = [];
    const detected = new Map<string, { sample: NormalizedSample; risk: RiskAssessment }>();
    for (const { sample_json } of stored) {
      const sample = JSON.parse(sample_json) as NormalizedSample;
      const now = Date.parse(sample.instant);
      recent.push(sample);
      while (recent.length && Date.parse(recent[0]!.instant) < now - 40_000) recent.shift();
      if (recent.length < 5) continue;
      const risk = detector.evaluate(recent, baseline);
      if (risk.level !== 'abnormal' && risk.level !== 'worsening') continue;
      for (const candidate of recent) {
        if (Date.parse(candidate.instant) < now - 29_000) continue;
        const previous = detected.get(candidate.instant);
        if (!previous || risk.level === 'worsening') detected.set(candidate.instant, { sample: candidate, risk });
      }
    }
    const audited = [...detected.values()].sort((a, b) => a.sample.instant.localeCompare(b.sample.instant));
    let group: typeof audited = [];
    const flush = () => {
      if (!group.length) return;
      const risk = group.find(item => item.risk.level === 'worsening')?.risk ?? group[0]!.risk;
      this.auditRisk(wearerId, group.map(item => item.sample), source, risk);
      group = [];
    };
    for (const item of audited) {
      if (group.length && Date.parse(item.sample.instant) - Date.parse(group.at(-1)!.sample.instant) > demoThresholds.maxRecentGapSeconds * 1000) flush();
      group.push(item);
    }
    flush();
  }

  private insertRiskAudit(wearerId: string, sample: VitalSample, source: SampleSource, reason: string, riskReasons: string[]): void {
    const { location: _location, ...withoutLocation } = sample;
    this.db.raw.prepare('INSERT OR IGNORE INTO risk_sample_audit(wearer_id,sampled_at,source,reason,risk_reasons_json,sample_json) VALUES (?,?,?,?,?,?)').run(wearerId, new Date(sample.timestamp).toISOString(), source, reason, JSON.stringify(riskReasons), JSON.stringify(withoutLocation));
  }

  private refreshMinute(wearerId: string, sample: NormalizedSample, reasons: string[]): void {
    const rows = this.db.raw.prepare('SELECT sample_json FROM ingested_samples WHERE wearer_id = ? AND sampled_at >= ? AND sampled_at < ?').all(wearerId, new Date(sample.minute).toISOString(), new Date(Date.parse(sample.minute) + 60_000).toISOString()) as { sample_json: string }[];
    const minuteSamples = rows.map(row => JSON.parse(row.sample_json) as NormalizedSample).filter(item => item.activity === sample.activity);
    const trusted = minuteSamples.filter(item => item.deviceTrusted !== false && item.activity !== 'unknown');
    const value = (field: 'heartRate' | 'spo2' | 'systolicBP' | 'diastolicBP') => median(trusted.flatMap(item => item[field] === undefined ? [] : [item[field]!]));
    const existing = this.db.raw.prepare('SELECT baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ? AND minute_at = ? AND context = ?').get(wearerId, sample.minute, sample.activity) as { baseline_eligible: number; exclusion_reasons_json: string } | undefined;
    const allReasons = [...new Set([...(existing ? JSON.parse(existing.exclusion_reasons_json) as string[] : []), ...reasons])];
    this.db.raw.prepare('INSERT INTO minute_vitals(wearer_id, minute_at, local_date, context, heart_rate, spo2, systolic_bp, diastolic_bp, sample_count, baseline_eligible, exclusion_reasons_json, aggregation_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2) ON CONFLICT(wearer_id, minute_at, context) DO UPDATE SET heart_rate = excluded.heart_rate, spo2 = excluded.spo2, systolic_bp = excluded.systolic_bp, diastolic_bp = excluded.diastolic_bp, sample_count = excluded.sample_count, baseline_eligible = MIN(minute_vitals.baseline_eligible, excluded.baseline_eligible), exclusion_reasons_json = excluded.exclusion_reasons_json, aggregation_version = 2').run(wearerId, sample.minute, sample.localDate, sample.activity, value('heartRate'), value('spo2'), value('systolicBP'), value('diastolicBP'), minuteSamples.length, reasons.length > 0 || existing?.baseline_eligible === 0 ? 0 : 1, JSON.stringify(allReasons));
  }

  private refreshDay(wearerId: string, date: string, paused: boolean): void {
    const rows = this.db.raw.prepare('SELECT sample_json FROM ingested_samples WHERE wearer_id = ?').all(wearerId) as { sample_json: string }[];
    const samples = rows.map(row => JSON.parse(row.sample_json) as NormalizedSample).filter(item => item.localDate === date);
    this.summaries.upsert(buildDailySummary(wearerId, date, samples, paused));
    this.summaries.reconcileEligibility(wearerId, date);
  }
}
