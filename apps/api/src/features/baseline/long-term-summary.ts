export interface HistoryRecord { version: number; cycleId?: string; baseline: Record<string, unknown> }
export interface LongTermMemory {
  recent: HistoryRecord[];
  olderVersions: number[];
  numericFacts: Record<string, number>;
  summary: string | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Reduces older full versions to small, deterministic facts before a model sees them. */
export function assembleLongTermMemory(history: HistoryRecord[], priorText: string | null = null): LongTermMemory {
  const sorted = [...history].sort((a, b) => b.version - a.version);
  const recentCount = sorted.length >= 4 ? 3 : sorted.length;
  const recent = sorted.slice(0, recentCount);
  const older = sorted.slice(recentCount);
  const values = new Map<string, number[]>();
  for (const item of older) {
    const fields = (item.baseline.values ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const bucket = values.get(key) ?? [];
      bucket.push(value);
      values.set(key, bucket);
    }
  }
  const numericFacts = Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b)).map(([key, entries]) => [key, median(entries)]));
  const olderVersions = older.map(item => item.version).sort((a, b) => a - b);
  const priorPattern = priorText && !priorText.trimStart().startsWith('{') ? priorText.slice(0, 300) : null;
  const summary = older.length ? JSON.stringify({ olderVersions, numericFacts, priorPattern }) : null;
  return { recent, olderVersions, numericFacts, summary };
}
