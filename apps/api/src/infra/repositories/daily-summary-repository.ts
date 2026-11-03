import type { DailySummary } from '@anmai/contracts';
import type { DatabaseContext } from '../database.js';

export class DailySummaryRepository {
  constructor(private readonly db: DatabaseContext) {}

  upsert(summary: DailySummary): void {
    this.db.raw.prepare('INSERT INTO daily_summaries(wearer_id, date, summary_json) VALUES (?, ?, ?) ON CONFLICT(wearer_id, date) DO UPDATE SET summary_json = excluded.summary_json').run(summary.wearerId, summary.date, JSON.stringify(summary));
  }

  get(wearerId: string, date: string): DailySummary | null {
    const row = this.db.raw.prepare('SELECT summary_json FROM daily_summaries WHERE wearer_id = ? AND date = ?').get(wearerId, date) as { summary_json: string } | undefined;
    return row ? JSON.parse(row.summary_json) as DailySummary : null;
  }

  list(wearerId: string): DailySummary[] {
    const rows = this.db.raw.prepare('SELECT summary_json FROM daily_summaries WHERE wearer_id = ? ORDER BY date').all(wearerId) as { summary_json: string }[];
    return rows.map(row => JSON.parse(row.summary_json) as DailySummary);
  }

  reconcileEligibility(wearerId: string, date: string): DailySummary | null {
    const summary = this.get(wearerId, date);
    if (!summary) return null;
    const counts = this.db.raw.prepare("SELECT COUNT(DISTINCT CASE WHEN baseline_eligible = 1 THEN minute_at END) AS eligible_minutes, COUNT(DISTINCT CASE WHEN baseline_eligible = 1 AND context = 'resting' THEN minute_at END) AS resting_minutes FROM minute_vitals WHERE wearer_id = ? AND local_date = ?").get(wearerId, date) as { eligible_minutes: number; resting_minutes: number };
    if (!summary.baselineEligible || (counts.eligible_minutes >= 480 && counts.resting_minutes >= 120)) return summary;
    const updated: DailySummary = { ...summary, baselineEligible: false, exclusionReasons: [...new Set([...summary.exclusionReasons, 'excluded_readings' as const])] };
    this.upsert(updated);
    return updated;
  }
}
