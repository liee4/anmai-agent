export interface EvidenceWeights { current: number; recent: number[]; longTerm: number }

export function evidenceWeights(recentCount: number, hasLongTerm: boolean): EvidenceWeights {
  const count = Math.max(0, Math.min(4, recentCount));
  const longTerm = hasLongTerm ? 0.1 : 0;
  if (count === 0) return { current: 1 - longTerm, recent: [], longTerm };
  const recentTotal = 0.3;
  const fractions = Array.from({ length: count }, (_, index) => 2 ** (count - index - 1));
  const sum = fractions.reduce((a, b) => a + b, 0);
  const recent = fractions.map(value => Number((value / sum * recentTotal).toFixed(12)));
  return { current: hasLongTerm ? 0.6 : 0.7, recent, longTerm };
}

export function blendThresholdEvidence(currentRanges: Record<string, [number, number]>, recentValues: Record<string, number>[], longTermValues: Record<string, number>, weights: EvidenceWeights): Record<string, number> {
  const blended: Record<string, number> = {};
  for (const [field, [low, high]] of Object.entries(currentRanges)) {
    let sum = ((low + high) / 2) * weights.current;
    let weight = weights.current;
    for (const [index, values] of recentValues.entries()) {
      const value = values[field];
      if (value === undefined || !Number.isFinite(value)) continue;
      const contribution = weights.recent[index] ?? 0;
      sum += value * contribution;
      weight += contribution;
    }
    const historical = longTermValues[field];
    if (historical !== undefined && Number.isFinite(historical)) { sum += historical * weights.longTerm; weight += weights.longTerm; }
    blended[field] = Number((sum / weight).toFixed(3));
  }
  return blended;
}
