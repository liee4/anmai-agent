import type { IngestRequest, VitalSample } from '@anmai/contracts';

const dayMs = 86_400_000;
const firstDemoDate = '2026-10-01';

/** Prepares the next complete demo cycle from persisted dates, without consuming it. */
export function nextDemoHistory(wearerId: string, recordedDates: string[]): IngestRequest {
  const dates = [...new Set(recordedDates)].sort();
  const anchor = Date.parse(`${dates[0] ?? firstDemoDate}T00:00:00Z`);
  const latest = dates.at(-1);
  let cycleIndex = latest ? Math.floor((Date.parse(`${latest}T00:00:00Z`) - anchor) / (14 * dayMs)) : 0;
  const currentStart = anchor + cycleIndex * 14 * dayMs;
  const currentEnd = currentStart + 13 * dayMs;
  const covered = dates.filter(date => {
    const at = Date.parse(`${date}T00:00:00Z`);
    return at >= currentStart && at <= currentEnd;
  }).length;
  if (covered === 14) cycleIndex++;

  const start = anchor + cycleIndex * 14 * dayMs;
  // Keep adjacent demo cycles visibly different while staying in a plausible range.
  const phase = (cycleIndex * 2) % 11;
  const data: VitalSample[] = [];
  for (let day = 0; day < 14; day++) for (let minute = 0; minute < 480; minute++) {
    data.push({
      timestamp: new Date(start + day * dayMs + minute * 60_000).toISOString(),
      heartRate: minute < 120 ? 76 + phase * 2 + day % 3 : 91 + phase * 2 + day % 4,
      spo2: 97 - phase % 3,
      activity: minute < 120 ? 'resting' : 'activity',
    });
  }
  return { inputMode: 'auto', wearerId, data };
}
