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
      const expiresAt = new Date(Date.parse(record.publishedAt) + 365 * 86_400_000).toISOString();
      this.db.raw.prepare('UPDATE baseline_versions SET expires_at = ? WHERE wearer_id = ? AND version = (SELECT active_version FROM baseline_state WHERE wearer_id = ?)').run(expiresAt, record.wearerId, record.wearerId);
      this.db.raw.prepare('INSERT INTO baseline_versions(wearer_id, version, cycle_id, published_at, baseline_json) VALUES (?, ?, ?, ?, ?)').run(record.wearerId, record.version, record.cycleId, record.publishedAt, JSON.stringify(record.baseline));
      this.db.raw.prepare("INSERT INTO baseline_state(wearer_id, status, active_version) VALUES (?, 'active', ?) ON CONFLICT(wearer_id) DO UPDATE SET active_version = excluded.active_version").run(record.wearerId, record.version);
    });
  }

  nextVersion(wearerId: string): number {
    const row = this.db.raw.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM baseline_versions WHERE wearer_id = ?').get(wearerId) as { version: number };
    return row.version;
  }

  invalidateAffectedCycles(wearerId: string, affectedDates: string[], now: string): number {
    if (affectedDates.length === 0) return 0;
    const rows = this.db.raw.prepare('SELECT version, cycle_id FROM baseline_versions WHERE wearer_id = ? AND invalidated_at IS NULL ORDER BY version').all(wearerId) as { version: number; cycle_id: string }[];
    const affected = rows.find(row => {
      const startDate = row.cycle_id.slice(row.cycle_id.lastIndexOf(':') + 1);
      const start = Date.parse(`${startDate}T00:00:00Z`);
      if (!Number.isFinite(start)) return false;
      const endDate = new Date(start + 13 * 86_400_000).toISOString().slice(0, 10);
      return affectedDates.some(date => date >= startDate && date <= endDate);
    });
    if (!affected) return 0;
    const result = this.db.raw.prepare('UPDATE baseline_versions SET invalidated_at = ? WHERE wearer_id = ? AND version >= ? AND invalidated_at IS NULL').run(now, wearerId, affected.version);
    const latest = this.db.raw.prepare('SELECT MAX(version) AS version FROM baseline_versions WHERE wearer_id = ? AND invalidated_at IS NULL AND purged_at IS NULL').get(wearerId) as { version: number | null };
    this.db.raw.prepare('UPDATE baseline_state SET active_version = ? WHERE wearer_id = ?').run(latest.version, wearerId);
    return Number(result.changes);
  }

  purgeExpired(now: string): number {
    return this.db.transaction(() => {
      const rows = this.db.raw.prepare('SELECT wearer_id, version, cycle_id FROM baseline_versions WHERE expires_at IS NOT NULL AND expires_at <= ? AND purged_at IS NULL AND version != COALESCE((SELECT active_version FROM baseline_state WHERE wearer_id = baseline_versions.wearer_id), -1)').all(now) as { wearer_id: string; version: number; cycle_id: string }[];
      for (const row of rows) {
        this.db.raw.prepare("UPDATE baseline_versions SET baseline_json = '{}', purged_at = ? WHERE wearer_id = ? AND version = ?").run(now, row.wearer_id, row.version);
        this.db.raw.prepare('UPDATE baseline_attempts SET request_json = ?, response_json = NULL, validation_json = NULL WHERE wearer_id = ? AND cycle_id = ?').run('{}', row.wearer_id, row.cycle_id);
      }
      for (const wearerId of new Set(rows.map(row => row.wearer_id))) {
        const purged = new Set(rows.filter(row => row.wearer_id === wearerId).map(row => row.version));
        const active = this.getActive(wearerId);
        const contributors = active?.baseline.longTermContributors;
        if (Array.isArray(contributors) && contributors.some(version => typeof version === 'number' && purged.has(version))) this.updateActiveMemory(wearerId, null, []);
      }
      return rows.length;
    });
  }

  getActive(wearerId: string): StoredBaseline | null {
    const row = this.db.raw.prepare('SELECT v.wearer_id, v.version, v.cycle_id, v.published_at, v.baseline_json FROM baseline_versions v JOIN baseline_state s ON s.wearer_id = v.wearer_id AND s.active_version = v.version WHERE v.wearer_id = ? AND v.invalidated_at IS NULL').get(wearerId) as { wearer_id: string; version: number; cycle_id: string; published_at: string; baseline_json: string } | undefined;
    return row ? { wearerId: row.wearer_id, version: row.version, cycleId: row.cycle_id, publishedAt: row.published_at, baseline: JSON.parse(row.baseline_json) as Record<string, unknown> } : null;
  }

  listRecent(wearerId: string, after: string, limit = 4): StoredBaseline[] {
    const rows = this.db.raw.prepare('SELECT wearer_id, version, cycle_id, published_at, baseline_json FROM baseline_versions WHERE wearer_id = ? AND published_at >= ? AND purged_at IS NULL AND invalidated_at IS NULL ORDER BY version DESC LIMIT ?').all(wearerId, after, limit) as { wearer_id: string; version: number; cycle_id: string; published_at: string; baseline_json: string }[];
    return rows.map(row => ({ wearerId: row.wearer_id, version: row.version, cycleId: row.cycle_id, publishedAt: row.published_at, baseline: JSON.parse(row.baseline_json) as Record<string, unknown> }));
  }

  listRetained(wearerId: string, now: string): StoredBaseline[] {
    const rows = this.db.raw.prepare('SELECT wearer_id, version, cycle_id, published_at, baseline_json FROM baseline_versions WHERE wearer_id = ? AND purged_at IS NULL AND invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY version DESC').all(wearerId, now) as { wearer_id: string; version: number; cycle_id: string; published_at: string; baseline_json: string }[];
    return rows.map(row => ({ wearerId: row.wearer_id, version: row.version, cycleId: row.cycle_id, publishedAt: row.published_at, baseline: JSON.parse(row.baseline_json) as Record<string, unknown> }));
  }

  updateActiveMemory(wearerId: string, summary: string | null, contributors: number[]): void {
    const active = this.getActive(wearerId);
    if (!active) return;
    this.db.raw.prepare('UPDATE baseline_versions SET baseline_json = ? WHERE wearer_id = ? AND version = ?').run(JSON.stringify({ ...active.baseline, longTermSummary: summary, longTermContributors: contributors }), wearerId, active.version);
  }
}
