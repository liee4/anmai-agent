import type { NormalizedSample } from './normalizer.js';

export function splitDaily(samples: NormalizedSample[]): Map<string, NormalizedSample[]> {
  const grouped = new Map<string, NormalizedSample[]>();
  for (const sample of samples) {
    const day = grouped.get(sample.localDate) ?? [];
    day.push(sample);
    grouped.set(sample.localDate, day);
  }
  if (grouped.size !== 1) throw new Error('Daily input must cover one natural day');
  return grouped;
}
