import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrate.js';

export interface DatabaseContext {
  readonly raw: DatabaseSync;
  transaction<T>(work: () => T): T;
  close(): void;
}

export function openDatabase(path: string): DatabaseContext {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  migrate(raw);
  let transactionDepth = 0;
  return {
    raw,
    transaction<T>(work: () => T): T {
      const savepoint = `anmai_nested_${transactionDepth}`;
      const nested = transactionDepth > 0;
      raw.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
      transactionDepth += 1;
      try {
        const result = work();
        raw.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        if (nested) {
          raw.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          raw.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else raw.exec('ROLLBACK');
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },
    close: () => raw.close(),
  };
}
