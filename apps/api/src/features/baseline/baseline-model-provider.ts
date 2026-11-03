import type { BaselineCandidate, BaselineGenerationRequest } from '@anmai/contracts';

export interface CorrectionFeedback {
  attempt: number;
  rejectedFields: { field: string; reason: string; allowedRange: [number, number] }[];
  lockedFields: string[];
}

export interface BaselineModelProvider {
  generateCandidate(request: BaselineGenerationRequest, correction?: CorrectionFeedback): Promise<BaselineCandidate>;
}
