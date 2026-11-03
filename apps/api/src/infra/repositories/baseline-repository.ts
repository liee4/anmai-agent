import type { DatabaseContext } from '../database.js';

export interface StoredBaseline {
  wearerId: string;
  version: number;
  cycleId: string;
  publishedAt: string;
  baseline: Record<string, unknown>;
}

export class BaselineRepository {
  constructor(private readonly db: DatabaseContext) {}

  publish(record: StoredBaseline): void {
    this.db.transaction(() => {
      this.db.raw.prepare('INSERT INTO baseline_versions(wearer_id, version, cycle_id, published_at, baseline_json) VALUES (?, ?, ?, ?, ?)').run(record.wearerId, record.version, record.cycleId, record.publishedAt, JSON.stringify(record.baseline));
      this.db.raw.prepare("INSERT INTO baseline_state(wearer_id, status, active_version) VALUES (?, 'active', ?) ON CONFLICT(wearer_id) DO UPDATE SET active_version = excluded.active_version").run(record.wearerId, record.version);
    });
  }

  getActive(wearerId: string): StoredBaseline | null {
    const row = this.db.raw.prepare('SELECT v.wearer_id, v.version, v.cycle_id, v.published_at, v.baseline_json FROM baseline_versions v JOIN baseline_state s ON s.wearer_id = v.wearer_id AND s.active_version = v.version WHERE v.wearer_id = ?').get(wearerId) as { wearer_id: string; version: number; cycle_id: string; published_at: string; baseline_json: string } | undefined;
    return row ? { wearerId: row.wearer_id, version: row.version, cycleId: row.cycle_id, publishedAt: row.published_at, baseline: JSON.parse(row.baseline_json) as Record<string, unknown> } : null;
  }
}

