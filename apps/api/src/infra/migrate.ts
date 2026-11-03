import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

const initialSql = readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8');

export function migrate(database: DatabaseSync): void {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = database.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (current) return;
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(initialSql);
    database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

