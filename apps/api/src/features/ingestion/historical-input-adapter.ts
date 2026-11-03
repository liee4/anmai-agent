import type { NormalizedSample } from './normalizer.js';

export function splitHistorical(samples: NormalizedSample[]): Map<string, NormalizedSample[]> {
  const grouped = new Map<string, NormalizedSample[]>();
  for (const sample of samples) {
    const day = grouped.get(sample.localDate) ?? [];
    day.push(sample);
    grouped.set(sample.localDate, day);
  }
  return new Map([...grouped].sort(([a], [b]) => a.localeCompare(b)));
}
