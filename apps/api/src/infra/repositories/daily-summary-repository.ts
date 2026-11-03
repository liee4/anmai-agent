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
}

