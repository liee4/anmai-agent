import type { BaselineCandidate, BaselineGenerationRequest } from '@anmai/contracts';

export interface ValidationResult {
  accepted: Record<string, number>;
  rejected: { field: string; reason: string; allowedRange: [number, number] }[];
}

export function validateBaselineCandidate(request: BaselineGenerationRequest, candidate: BaselineCandidate, locked: Record<string, number>, previous: Record<string, number> = {}): ValidationResult {
  const accepted: Record<string, number> = {};
  const rejected: ValidationResult['rejected'] = [];
  const evidenceValid = candidate.baselineCandidate.evidenceRefs.length > 0 && candidate.baselineCandidate.evidenceRefs.every(id => request.evidenceRefs.includes(id));
  for (const [field, allowedRange] of Object.entries(request.allowedRanges)) {
    if (field in locked) continue;
    const [context, metric] = field.split('.');
    const contextValues = candidate.baselineCandidate.contexts[context as keyof BaselineCandidate['baselineCandidate']['contexts']];
    const value = contextValues?.[metric as keyof typeof contextValues];
    if (!evidenceValid) rejected.push({ field, reason: 'unknown_evidence_ref', allowedRange });
    else if (typeof value !== 'number' || !Number.isFinite(value)) rejected.push({ field, reason: 'missing_or_invalid_value', allowedRange });
    else if (value < allowedRange[0] || value > allowedRange[1]) rejected.push({ field, reason: 'outside_allowed_range', allowedRange });
    else if (previous[field] !== undefined && Math.abs(value - previous[field]) > (field.includes('spo2') ? 1 : 5)) rejected.push({ field, reason: 'version_delta_exceeded', allowedRange });
    else accepted[field] = value;
  }
  return { accepted, rejected };
}
