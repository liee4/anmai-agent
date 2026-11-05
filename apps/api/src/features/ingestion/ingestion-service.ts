import type { IngestRequest, IngestResult } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';
import { DailySummaryRepository } from '../../infra/repositories/daily-summary-repository.js';
import { classifyInput } from './input-classifier.js';
import { normalizeInput } from './normalizer.js';
import { splitDaily } from './daily-input-adapter.js';
import { splitHistorical } from './historical-input-adapter.js';
import { SamplePipeline } from './sample-pipeline.js';

export class IngestionService {
  private readonly summaries: DailySummaryRepository;
  private readonly pipeline: SamplePipeline;
  constructor(db: DatabaseContext, pipeline = new SamplePipeline(db)) { this.summaries = new DailySummaryRepository(db); this.pipeline = pipeline; }

  ingest(input: IngestRequest): IngestResult {
    const { request, samples } = normalizeInput(input);
    const detectedMode = classifyInput(request);
    const groups = detectedMode === 'daily' ? splitDaily(samples) : splitHistorical(samples);
    const { duplicateSamples, excludedSamples } = this.pipeline.store(request.wearerId, samples, detectedMode === 'daily' ? 'daily' : 'history');
      let successfulDays = 0;
      let invalidDays = 0;
      for (const date of groups.keys()) {
        if (this.summaries.get(request.wearerId, date)?.baselineEligible) successfulDays++; else invalidDays++;
      }
      return { detectedMode, coveredDays: groups.size, successfulDays, invalidDays, duplicateSamples, excludedSamples, completedCycles: 0, modelCalls: 0, baselineVersion: null };
  }
}
