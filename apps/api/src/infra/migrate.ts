import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

function migrationSql(file: string): string {
  const local = new URL(`./migrations/${file}`, import.meta.url);
  return readFileSync(existsSync(local) ? local : new URL(`../../src/infra/migrations/${file}`, import.meta.url), 'utf8');
}

export function migrate(database: DatabaseSync): void {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [version, file] of [[1, '001_initial.sql'], [2, '002_baseline_retention.sql'], [3, '003_wearer_monitor_state.sql'], [4, '004_local_day.sql'], [5, '005_event_health_state.sql'], [6, '006_simulated_delivery.sql'], [7, '007_baseline_exclusions.sql']] as const) {
    if (database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) continue;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migrationSql(file));
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}
