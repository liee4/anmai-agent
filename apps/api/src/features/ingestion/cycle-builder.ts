import type { DailySummary } from '@anmai/contracts';

export interface BaselineCycle {
  id: string;
  wearerId: string;
  startDate: string;
  endDate: string;
  validDays: number;
  eligible: boolean;
  days: DailySummary[];
}

export function buildCycles(summaries: DailySummary[]): BaselineCycle[] {
  if (summaries.length === 0) return [];
  const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
  const wearerId = sorted[0]!.wearerId;
  const byDate = new Map(sorted.filter(item => item.wearerId === wearerId).map(item => [item.date, item]));
  const first = new Date(`${sorted[0]!.date}T00:00:00Z`).getTime();
  const last = new Date(`${sorted[sorted.length - 1]!.date}T00:00:00Z`).getTime();
  const dayMs = 86_400_000;
  const cycles: BaselineCycle[] = [];
  for (let start = first; start + 13 * dayMs <= last; start += 14 * dayMs) {
    const dates = Array.from({ length: 14 }, (_, offset) => new Date(start + offset * dayMs).toISOString().slice(0, 10));
    const days = dates.map(date => byDate.get(date)).filter((value): value is DailySummary => value !== undefined);
    const validDays = days.filter(item => item.baselineEligible).length;
    cycles.push({ id: `${wearerId}:${dates[0]}`, wearerId, startDate: dates[0]!, endDate: dates[13]!, validDays, eligible: validDays >= 7, days });
  }
  return cycles;
}
