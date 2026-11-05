import type { IngestRequest, IngestResult } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';
import { DailySummaryRepository } from '../../infra/repositories/daily-summary-repository.js';
import { BaselineRepository } from '../../infra/repositories/baseline-repository.js';
import type { PersonalBaseline } from '../monitoring/risk-detector.js';
import { classifyInput } from './input-classifier.js';
import { normalizeInput } from './normalizer.js';
import { splitDaily } from './daily-input-adapter.js';
import { splitHistorical } from './historical-input-adapter.js';
import { SamplePipeline } from './sample-pipeline.js';

export class IngestionService {
  private readonly summaries: DailySummaryRepository;
  private readonly pipeline: SamplePipeline;
  private readonly baselines: BaselineRepository;
  constructor(private readonly db: DatabaseContext, pipeline = new SamplePipeline(db)) { this.summaries = new DailySummaryRepository(db); this.baselines = new BaselineRepository(db); this.pipeline = pipeline; }

  ingest(input: IngestRequest): IngestResult {
    const { request, samples } = normalizeInput(input);
    const detectedMode = classifyInput(request);
    const groups = detectedMode === 'daily' ? splitDaily(samples) : splitHistorical(samples);
    return this.db.transaction(() => {
      const source = detectedMode === 'daily' ? 'daily' : 'history';
      const activeBaseline = this.baselines.getActive(request.wearerId);
      const { duplicateSamples, excludedSamples } = this.pipeline.store(request.wearerId, samples, source);
      if (activeBaseline) this.pipeline.scanImportedRisk(request.wearerId, samples, source, activeBaseline.baseline as PersonalBaseline);
      let successfulDays = 0;
      let invalidDays = 0;
      for (const date of groups.keys()) {
        if (this.summaries.get(request.wearerId, date)?.baselineEligible) successfulDays++; else invalidDays++;
      }
      return { detectedMode, coveredDays: groups.size, successfulDays, invalidDays, duplicateSamples, excludedSamples, completedCycles: 0, modelCalls: 0, baselineVersion: null };
    });
  }
}
