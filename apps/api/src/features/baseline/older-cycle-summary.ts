import type { DatabaseContext } from '../../infra/database.js';
import type { BaselineCycle } from '../ingestion/cycle-builder.js';
import { buildObservationBaseline, type BaselineReading } from './observation-baseline.js';
import { median } from '../monitoring/sliding-window.js';

interface CycleFact { cycleId: string; startDate: string; endDate: string; validDays: number; values: Record<string, number> }

export function summarizeOlderCycle(db: DatabaseContext, cycle: BaselineCycle): CycleFact {
  const dates = new Set(cycle.days.filter(day => day.baselineEligible).map(day => day.date));
  const rows = db.raw.prepare('SELECT minute_at, local_date, context, heart_rate, spo2, systolic_bp, diastolic_bp FROM minute_vitals WHERE wearer_id = ? AND local_date >= ? AND local_date <= ? AND baseline_eligible = 1').all(cycle.wearerId, cycle.startDate, cycle.endDate) as { minute_at: string; local_date: string; context: BaselineReading['context']; heart_rate: number | null; spo2: number | null; systolic_bp: number | null; diastolic_bp: number | null }[];
  const readings: BaselineReading[] = rows.filter(row => dates.has(row.local_date)).map(row => ({ minuteAt: row.minute_at, context: row.context, baselineEligible: true, ...(row.heart_rate === null ? {} : { heartRate: row.heart_rate }), ...(row.spo2 === null ? {} : { spo2: row.spo2 }), ...(row.systolic_bp === null ? {} : { systolicBP: row.systolic_bp }), ...(row.diastolic_bp === null ? {} : { diastolicBP: row.diastolic_bp }) }));
  const values: Record<string, number> = {};
  for (const observation of Object.values(buildObservationBaseline(readings))) {
    const prefix = observation.context;
    if (observation.heartRate) values[`${prefix}.heartRateWarningUpper`] = Math.min(119, Math.max(80, Math.round(observation.heartRate.p90 + 15)));
    if (observation.spo2) values[`${prefix}.spo2WarningLower`] = Math.max(93, Math.min(99, Math.round(observation.spo2.median - 2)));
    if (observation.systolicBP) values[`${prefix}.systolicBPWarningUpper`] = Math.min(179, Math.max(120, Math.round(observation.systolicBP.p90 + 15)));
  }
  return { cycleId: cycle.id, startDate: cycle.startDate, endDate: cycle.endDate, validDays: cycle.validDays, values };
}

export function loadOlderCycleMemory(db: DatabaseContext, wearerId: string): { summary: string | null; numericFacts: Record<string, number>; cycleIds: string[] } {
  const rows = db.raw.prepare('SELECT cycle_id, start_date, end_date, valid_days, facts_json FROM older_cycle_summaries WHERE wearer_id = ? ORDER BY start_date').all(wearerId) as { cycle_id: string; start_date: string; end_date: string; valid_days: number; facts_json: string }[];
  if (!rows.length) return { summary: null, numericFacts: {}, cycleIds: [] };
  const grouped = new Map<string, number[]>();
  for (const row of rows) for (const [key, value] of Object.entries(JSON.parse(row.facts_json) as Record<string, number>)) {
    const bucket = grouped.get(key) ?? []; bucket.push(value); grouped.set(key, bucket);
  }
  const numericFacts = Object.fromEntries([...grouped].map(([key, values]) => [key, median(values)!]));
  const cycleIds = rows.map(row => row.cycle_id);
  const summary = JSON.stringify({ cycleIds, startDate: rows[0]!.start_date, endDate: rows.at(-1)!.end_date, validDays: rows.reduce((sum, row) => sum + row.valid_days, 0), numericFacts });
  return { summary, numericFacts, cycleIds };
}
