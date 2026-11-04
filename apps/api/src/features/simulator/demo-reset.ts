import type { DatabaseContext } from '../../infra/database.js';

/** Clears one demo wearer without affecting another wearer's records. */
export function resetDemoWearer(db: DatabaseContext, wearerId: string): void {
  db.transaction(() => {
    for (const table of ['simulated_deliveries', 'event_health_state', 'event_timeline', 'anomaly_snippets', 'deadlines']) {
      db.raw.prepare(`DELETE FROM ${table} WHERE event_id IN (SELECT event_id FROM emergency_events WHERE wearer_id = ?)`).run(wearerId);
    }
    for (const table of ['emergency_events', 'wearer_monitor_state', 'baseline_exclusions', 'baseline_attempts', 'baseline_versions', 'baseline_state', 'daily_summaries', 'minute_vitals', 'ingested_samples', 'import_batches']) {
      db.raw.prepare(`DELETE FROM ${table} WHERE wearer_id = ?`).run(wearerId);
    }
  });
}
