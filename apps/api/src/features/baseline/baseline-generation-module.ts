import type { BaselineGenerationRequest } from '@anmai/contracts';
import type { BaselineModelProvider, CorrectionFeedback } from './baseline-model-provider.js';
import { validateBaselineCandidate } from './baseline-safety-validator.js';

export interface BaselineAttempt { number: number; rejected: string[]; accepted: string[]; error?: string; candidate?: unknown; feedback?: CorrectionFeedback }
export interface BaselineGenerationResult { values: Record<string, number>; attempts: BaselineAttempt[]; fallbackFields: string[]; longTermSummary: string | null; summaryAccepted: boolean }

export async function generateBaseline(request: BaselineGenerationRequest, provider: BaselineModelProvider, previous: Record<string, number> = {}): Promise<BaselineGenerationResult> {
  const locked: Record<string, number> = {};
  const attempts: BaselineAttempt[] = [];
  let feedback: CorrectionFeedback | undefined;
  let longTermSummary = request.longTermSummary;
  let summaryAccepted = false;
  for (let number = 1; number <= 5; number++) {
    try {
      const candidate = await provider.generateCandidate(request, feedback);
      const validation = validateBaselineCandidate(request, candidate, locked, previous);
      Object.assign(locked, validation.accepted);
      const summary = candidate.updatedLongTermSummaryCandidate?.trim();
      if (!summaryAccepted && summary && summary.length <= 800) { longTermSummary = summary; summaryAccepted = true; }
      attempts.push({ number, rejected: validation.rejected.map(item => item.field), accepted: Object.keys(validation.accepted), candidate, ...(feedback ? { feedback } : {}) });
      if (validation.rejected.length === 0) break;
      feedback = { attempt: number + 1, rejectedFields: validation.rejected, lockedFields: Object.keys(locked) };
    } catch (error) {
      attempts.push({ number, rejected: Object.keys(request.allowedRanges).filter(field => !(field in locked)), accepted: [], error: error instanceof Error ? error.message : String(error), ...(feedback ? { feedback } : {}) });
    }
  }
  const fallbackFields: string[] = [];
  for (const [field, range] of Object.entries(request.allowedRanges)) {
    if (field in locked) continue;
    const prior = previous[field];
    locked[field] = prior !== undefined && prior >= range[0] && prior <= range[1] ? prior : field.endsWith('Lower') ? range[1] : range[0];
    fallbackFields.push(field);
  }
  return { values: locked, attempts, fallbackFields, longTermSummary, summaryAccepted };
}
