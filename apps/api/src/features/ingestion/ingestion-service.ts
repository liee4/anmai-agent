import type { IngestRequest, IngestResult } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';
import { DailySummaryRepository } from '../../infra/repositories/daily-summary-repository.js';
import { classifyInput } from './input-classifier.js';
import { normalizeInput } from './normalizer.js';
import { splitDaily } from './daily-input-adapter.js';
import { splitHistorical } from './historical-input-adapter.js';
import { buildDailySummary } from './daily-summary-builder.js';
import { demoThresholds } from '../monitoring/detection-config.js';
import { BaselineExclusionRepository } from '../../infra/repositories/baseline-exclusion-repository.js';

export class IngestionService {
  private readonly summaries: DailySummaryRepository;
  private readonly exclusions: BaselineExclusionRepository;
  constructor(private readonly db: DatabaseContext) { this.summaries = new DailySummaryRepository(db); this.exclusions = new BaselineExclusionRepository(db); }

  ingest(input: IngestRequest): IngestResult {
    const { request, samples } = normalizeInput(input);
    const detectedMode = classifyInput(request);
    const groups = detectedMode === 'daily' ? splitDaily(samples) : splitHistorical(samples);
    return this.db.transaction(() => {
      const state = this.db.raw.prepare('SELECT status FROM baseline_state WHERE wearer_id = ?').get(request.wearerId) as { status: string } | undefined;
      const learningPaused = state?.status === 'paused';
      let duplicateSamples = 0;
      let excludedSamples = 0;
      let successfulDays = 0;
      let invalidDays = 0;
      for (const [date, day] of groups) {
        for (const sample of day) {
          const inserted = this.db.raw.prepare('INSERT OR IGNORE INTO ingested_samples(wearer_id, sampled_at, sample_json) VALUES (?, ?, ?)').run(request.wearerId, sample.instant, JSON.stringify(sample));
          if (!inserted.changes) { duplicateSamples++; continue; }
          const acute = (sample.heartRate !== undefined && (sample.heartRate > demoThresholds.heartRateUpper || sample.heartRate < demoThresholds.heartRateLower)) || (sample.spo2 !== undefined && sample.spo2 < demoThresholds.spo2Lower) || (sample.systolicBP !== undefined && (sample.systolicBP > demoThresholds.systolicBPUpper || sample.systolicBP < demoThresholds.systolicBPLower));
          const riskExclusions = this.exclusions.reasonsAt(request.wearerId, sample.instant);
          const eligible = !learningPaused && !acute && riskExclusions.length === 0 && sample.deviceTrusted !== false && sample.activity !== 'unknown' && sample.heartRate !== undefined && sample.spo2 !== undefined;
          if (!eligible) excludedSamples++;
          const reasons = [learningPaused && 'baseline_paused', acute && 'acute_anomaly', ...riskExclusions, sample.deviceTrusted === false && 'device_untrusted', sample.activity === 'unknown' && 'activity_unknown', (sample.heartRate === undefined || sample.spo2 === undefined) && 'missing_value'].filter((reason): reason is string => typeof reason === 'string');
          this.db.raw.prepare('INSERT INTO minute_vitals(wearer_id, minute_at, local_date, context, heart_rate, spo2, systolic_bp, diastolic_bp, sample_count, baseline_eligible, exclusion_reasons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(wearer_id, minute_at, context) DO UPDATE SET sample_count = sample_count + 1, baseline_eligible = MIN(baseline_eligible, excluded.baseline_eligible), exclusion_reasons_json = CASE WHEN excluded.baseline_eligible = 0 THEN excluded.exclusion_reasons_json ELSE exclusion_reasons_json END').run(request.wearerId, sample.minute, sample.localDate, sample.activity, sample.heartRate ?? null, sample.spo2 ?? null, sample.systolicBP ?? null, sample.diastolicBP ?? null, eligible ? 1 : 0, JSON.stringify(reasons));
        }
        const existing = this.db.raw.prepare('SELECT sample_json FROM ingested_samples WHERE wearer_id = ?').all(request.wearerId) as { sample_json: string }[];
        // The stored local date is retained in sample_json for offset-aware day grouping.
        const persisted = existing.map(row => JSON.parse(row.sample_json) as typeof samples[number]).filter(item => item.localDate === date);
        const summary = buildDailySummary(request.wearerId, date, persisted, learningPaused);
        this.summaries.upsert(summary);
        if (this.summaries.reconcileEligibility(request.wearerId, date)?.baselineEligible) successfulDays++; else invalidDays++;
      }
      return { detectedMode, coveredDays: groups.size, successfulDays, invalidDays, duplicateSamples, excludedSamples, completedCycles: 0, modelCalls: 0, baselineVersion: null };
    });
  }
}
