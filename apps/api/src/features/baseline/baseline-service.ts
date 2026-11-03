import { randomUUID } from 'node:crypto';
import type { BaselineGenerationRequest, ObservationBaseline } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';
import { BaselineRepository, type StoredBaseline } from '../../infra/repositories/baseline-repository.js';
import { DailySummaryRepository } from '../../infra/repositories/daily-summary-repository.js';
import { buildCycles, type BaselineCycle } from '../ingestion/cycle-builder.js';
import type { BaselineModelProvider } from './baseline-model-provider.js';
import { generateBaseline } from './baseline-generation-module.js';
import { blendThresholdEvidence, evidenceWeights } from './memory-assembler.js';
import { buildObservationBaseline, type BaselineReading } from './observation-baseline.js';
import { assembleLongTermMemory } from './long-term-summary.js';
import { BaselineExclusionRepository } from '../../infra/repositories/baseline-exclusion-repository.js';

export interface PublishedBaseline {
  [key: string]: unknown;
  observations: ObservationBaseline[];
  values: Record<string, number>;
  evidenceWeights: ReturnType<typeof evidenceWeights>;
  attempts: Awaited<ReturnType<typeof generateBaseline>>['attempts'];
  provider: string;
  longTermSummary: string | null;
  longTermContributors: number[];
}

function allowedRanges(observations: ObservationBaseline[]): Record<string, [number, number]> {
  const result: Record<string, [number, number]> = {};
  for (const observation of observations) {
    const prefix = observation.context;
    if (observation.heartRate) {
      const upper: [number, number] = [Math.max(80, Math.round(observation.heartRate.p90)), 119];
      const lower: [number, number] = [51, Math.min(70, Math.round(observation.heartRate.p10))];
      if (upper[0] <= upper[1]) result[`${prefix}.heartRateWarningUpper`] = upper;
      if (lower[0] <= lower[1]) result[`${prefix}.heartRateWarningLower`] = lower;
    }
    if (observation.spo2) {
      const range: [number, number] = [93, Math.min(99, Math.round(observation.spo2.median))];
      if (range[0] <= range[1]) result[`${prefix}.spo2WarningLower`] = range;
    }
    if (observation.systolicBP) result[`${prefix}.systolicBPWarningUpper`] = [120, 179];
    if (observation.diastolicBP) result[`${prefix}.diastolicBPWarningUpper`] = [80, 119];
  }
  return result;
}

export class BaselineService {
  private readonly baselines: BaselineRepository;
  private readonly summaries: DailySummaryRepository;
  private readonly exclusions: BaselineExclusionRepository;

  constructor(private readonly db: DatabaseContext, private readonly provider: BaselineModelProvider, private readonly providerName = 'fake') {
    this.baselines = new BaselineRepository(db);
    this.summaries = new DailySummaryRepository(db);
    this.exclusions = new BaselineExclusionRepository(db);
  }

  getActive(wearerId: string): StoredBaseline | null { return this.baselines.getActive(wearerId); }

  getState(wearerId: string): { status: string; pausedAt: string | null; reason: string | null } {
    const row = this.db.raw.prepare('SELECT status, paused_at, pause_reason FROM baseline_state WHERE wearer_id = ?').get(wearerId) as { status: string; paused_at: string | null; pause_reason: string | null } | undefined;
    return { status: row?.status ?? 'active', pausedAt: row?.paused_at ?? null, reason: row?.pause_reason ?? null };
  }

  resume(wearerId: string): boolean {
    const active = this.db.raw.prepare('SELECT 1 FROM emergency_events WHERE wearer_id = ? AND closed_at IS NULL LIMIT 1').get(wearerId);
    if (active) return false;
    this.db.raw.prepare("INSERT INTO baseline_state(wearer_id,status) VALUES (?,'active') ON CONFLICT(wearer_id) DO UPDATE SET status = 'active', paused_at = NULL, pause_reason = NULL").run(wearerId);
    return true;
  }

  async generatePending(wearerId: string): Promise<{ completedCycles: number; modelCalls: number; baselineVersion: number | null }> {
    this.baselines.purgeExpired(new Date().toISOString());
    const cycles = buildCycles(this.summaries.list(wearerId)).filter(cycle => cycle.eligible);
    let modelCalls = 0;
    if (this.getState(wearerId).status !== 'paused') {
      const pending = cycles.filter(cycle => !this.wasProcessed(wearerId, cycle.id)).slice(-4);
      for (const cycle of pending) modelCalls += await this.generateCycle(cycle);
    }
    return { completedCycles: cycles.length, modelCalls, baselineVersion: this.getActive(wearerId)?.version ?? null };
  }

  private wasProcessed(wearerId: string, cycleId: string): boolean {
    return Boolean(this.db.raw.prepare('SELECT 1 FROM baseline_versions WHERE wearer_id = ? AND cycle_id = ? UNION ALL SELECT 1 FROM baseline_attempts WHERE wearer_id = ? AND cycle_id = ? LIMIT 1').get(wearerId, cycleId, wearerId, cycleId));
  }

  private async generateCycle(cycle: BaselineCycle): Promise<number> {
    const exclusionRevision = this.exclusions.revision(cycle.wearerId);
    const { request, contributors } = this.makeRequest(cycle);
    if (request.observations.length === 0 || Object.keys(request.allowedRanges).length === 0) return 0;
    const prior = this.getActive(cycle.wearerId);
    const priorValues = (prior?.baseline as Partial<PublishedBaseline> | undefined)?.values ?? {};
    const result = await generateBaseline(request, this.provider, priorValues);
    if (this.exclusions.revision(cycle.wearerId) !== exclusionRevision) return 0;
    const publishedAt = new Date().toISOString();
    this.db.transaction(() => {
      for (const attempt of result.attempts) {
        this.db.raw.prepare('INSERT INTO baseline_attempts(id, wearer_id, cycle_id, attempt, request_json, response_json, validation_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), cycle.wearerId, cycle.id, attempt.number, JSON.stringify({ request, correction: attempt.feedback ?? null }), attempt.candidate ? JSON.stringify(attempt.candidate) : null, JSON.stringify({ accepted: attempt.accepted, rejected: attempt.rejected, error: attempt.error ?? null }), publishedAt);
      }
      const accepted = result.attempts.some(attempt => attempt.accepted.length > 0);
      if (this.getState(cycle.wearerId).status === 'paused') return;
      if (!accepted || JSON.stringify(result.values) === JSON.stringify(priorValues)) {
        if (result.summaryAccepted && prior) this.baselines.updateActiveMemory(cycle.wearerId, result.longTermSummary, contributors);
        return;
      }
      const baseline: PublishedBaseline = { observations: request.observations, values: result.values, evidenceWeights: evidenceWeights(request.recentBaselines.length, request.longTermSummary !== null), attempts: result.attempts, provider: this.providerName, longTermSummary: result.longTermSummary, longTermContributors: contributors };
      this.baselines.publish({ wearerId: cycle.wearerId, version: this.baselines.nextVersion(cycle.wearerId), cycleId: cycle.id, publishedAt, baseline });
    });
    return result.attempts.length;
  }

  private makeRequest(cycle: BaselineCycle): { request: BaselineGenerationRequest; contributors: number[] } {
    const eligibleDates = new Set(cycle.days.filter(day => day.baselineEligible).map(day => day.date));
    const rows = this.db.raw.prepare('SELECT minute_at, local_date, context, heart_rate, spo2, systolic_bp, diastolic_bp, baseline_eligible FROM minute_vitals WHERE wearer_id = ? ORDER BY minute_at').all(cycle.wearerId) as { minute_at: string; local_date: string; context: BaselineReading['context']; heart_rate: number | null; spo2: number | null; systolic_bp: number | null; diastolic_bp: number | null; baseline_eligible: number }[];
    const readings: BaselineReading[] = rows.filter(row => eligibleDates.has(row.local_date)).map(row => ({ minuteAt: row.minute_at, context: row.context, baselineEligible: row.baseline_eligible === 1, ...(row.heart_rate === null ? {} : { heartRate: row.heart_rate }), ...(row.spo2 === null ? {} : { spo2: row.spo2 }), ...(row.systolic_bp === null ? {} : { systolicBP: row.systolic_bp }), ...(row.diastolic_bp === null ? {} : { diastolicBP: row.diastolic_bp }) }));
    const observations = Object.values(buildObservationBaseline(readings));
    const history = this.baselines.listRetained(cycle.wearerId, new Date().toISOString());
    const active = history[0]?.baseline as Partial<PublishedBaseline> | undefined;
    const initialMemory = assembleLongTermMemory(history);
    const priorText = active?.longTermContributors?.every(version => initialMemory.olderVersions.includes(version)) ? active.longTermSummary ?? null : null;
    const memory = assembleLongTermMemory(history, priorText);
    const recent = memory.recent;
    const longTermSummary = memory.summary;
    const weights = evidenceWeights(recent.length, longTermSummary !== null);
    const baseRanges = allowedRanges(observations);
    const weightedEvidence = blendThresholdEvidence(baseRanges, recent.map(item => (item.baseline.values ?? {}) as Record<string, number>), memory.numericFacts, weights);
    const constrainedRanges = Object.fromEntries(Object.entries(baseRanges).map(([field, range]) => {
      const center = weightedEvidence[field]!;
      const spread = field.includes('spo2') ? 2 : 15;
      return [field, [Math.max(range[0], Math.floor(center - spread)), Math.min(range[1], Math.ceil(center + spread))]];
    })) as Record<string, [number, number]>;
    const request: BaselineGenerationRequest = {
      wearerId: cycle.wearerId,
      cycleId: cycle.id,
      cycleStart: `${cycle.startDate}T00:00:00Z`,
      cycleEnd: `${cycle.endDate}T23:59:59Z`,
      validDays: cycle.validDays,
      observations,
      recentBaselines: recent.map((item, index) => ({ version: item.version, cycleId: item.cycleId ?? `version:${item.version}`, weight: weights.recent[index], observations: item.baseline.observations, values: item.baseline.values })),
      longTermSummary,
      evidenceWeights: { current: weights.current, recent: weights.recent.reduce((sum, weight) => sum + weight, 0), longTerm: weights.longTerm },
      weightedEvidence,
      allowedRanges: constrainedRanges,
      evidenceRefs: [cycle.id, ...recent.map(item => item.cycleId ?? `version:${item.version}`), ...(memory.olderVersions.length ? [`longterm:${memory.olderVersions.join('-')}`] : [])],
    };
    return { request, contributors: memory.olderVersions };
  }
}
