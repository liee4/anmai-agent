import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/infra/database.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('SQLite persistence', () => {
  it('keeps data across close and reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anmai-db-')); dirs.push(dir);
    const path = join(dir, 'anmai.sqlite');
    const first = openDatabase(path);
    first.raw.prepare('INSERT INTO import_batches(id, wearer_id, created_at) VALUES (?, ?, ?)').run('batch-1', 'wearer-1', '2026-10-28T00:00:00Z');
    first.close();
    const second = openDatabase(path);
    expect(second.raw.prepare('SELECT wearer_id FROM import_batches WHERE id = ?').get('batch-1')).toMatchObject({ wearer_id: 'wearer-1' });
    second.close();
  });

  it('rolls back an entire failed transaction', () => {
    const db = openDatabase(':memory:');
    expect(() => db.transaction(() => {
      db.raw.prepare('INSERT INTO import_batches(id, wearer_id, created_at) VALUES (?, ?, ?)').run('batch-2', 'wearer-1', '2026-10-28T00:00:00Z');
      throw new Error('test failure');
    })).toThrow('test failure');
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toMatchObject({ count: 0 });
    db.close();
  });

  it('keeps foreign-key enforcement enabled', () => {
    const db = openDatabase(':memory:');
    expect(db.raw.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
    db.close();
  });

  it('supports nested repository transactions without committing an outer failed batch', () => {
    const db = openDatabase(':memory:');
    expect(() => db.transaction(() => {
      db.transaction(() => db.raw.prepare('INSERT INTO import_batches(id, wearer_id, created_at) VALUES (?, ?, ?)').run('nested', 'wearer-1', '2026-10-28T00:00:00Z'));
      throw new Error('outer failure');
    })).toThrow('outer failure');
    expect(db.raw.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toMatchObject({ count: 0 });
    db.close();
  });
});

