import type { DatabaseContext } from '../database.js';
import { DailySummaryRepository } from './daily-summary-repository.js';
import { BaselineRepository } from './baseline-repository.js';

function minuteAt(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 16) + ':00Z';
}

export class BaselineExclusionRepository {
  constructor(private readonly db: DatabaseContext) {}

  revision(wearerId: string): number {
    const row = this.db.raw.prepare('SELECT COUNT(*) AS count FROM baseline_exclusions WHERE wearer_id = ?').get(wearerId) as { count: number };
    return row.count;
  }

  reasonsAt(wearerId: string, timestamp: string): string[] {
    const rows = this.db.raw.prepare('SELECT DISTINCT reason FROM baseline_exclusions WHERE wearer_id = ? AND start_minute <= ? AND end_minute >= ? ORDER BY reason').all(wearerId, minuteAt(timestamp), minuteAt(timestamp)) as { reason: string }[];
    return rows.map(row => row.reason);
  }

  excludeRange(wearerId: string, start: string, end: string, reason: string): void {
    const startMinute = minuteAt(start);
    const endMinute = minuteAt(end);
    if (startMinute > endMinute) return;
    this.db.transaction(() => {
      this.db.raw.prepare('INSERT OR IGNORE INTO baseline_exclusions(wearer_id, start_minute, end_minute, reason) VALUES (?, ?, ?, ?)').run(wearerId, startMinute, endMinute, reason);
      const rows = this.db.raw.prepare('SELECT minute_at, local_date, context, baseline_eligible, exclusion_reasons_json FROM minute_vitals WHERE wearer_id = ? AND minute_at BETWEEN ? AND ?').all(wearerId, startMinute, endMinute) as { minute_at: string; local_date: string; context: string; baseline_eligible: number; exclusion_reasons_json: string }[];
      const affectedDates = new Set<string>();
      for (const row of rows) {
        if (row.baseline_eligible === 1) affectedDates.add(row.local_date);
        const reasons = new Set(JSON.parse(row.exclusion_reasons_json) as string[]);
        reasons.add(reason);
        this.db.raw.prepare('UPDATE minute_vitals SET baseline_eligible = 0, exclusion_reasons_json = ? WHERE wearer_id = ? AND minute_at = ? AND context = ?').run(JSON.stringify([...reasons]), wearerId, row.minute_at, row.context);
      }
      const summaries = new DailySummaryRepository(this.db);
      for (const date of affectedDates) summaries.reconcileEligibility(wearerId, date);
      new BaselineRepository(this.db).invalidateAffectedCycles(wearerId, [...affectedDates], new Date().toISOString());
    });
  }
}
