import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseContext } from '../../infra/database.js';

export type ProviderMode = 'fake' | 'deepseek';
interface SessionRow { id: string; wearer_id: string; mode: ProviderMode; calls: number }

export class DemoSessions {
  private readonly active = new Map<string, number>();
  readonly internalToken = randomBytes(32).toString('hex');
  private readonly accessHash: string;
  constructor(private readonly db: DatabaseContext, readonly accessToken: string | null, readonly deepseekConfigured: boolean, private readonly sessionLimit = 20, private readonly globalLimit = 100) {
    if (accessToken && accessToken.length < 24) throw new Error('DEMO_ACCESS_TOKEN must contain at least 24 characters');
    if (!Number.isInteger(sessionLimit) || sessionLimit < 1 || !Number.isInteger(globalLimit) || globalLimit < 1) throw new Error('Demo call limits must be positive integers');
    this.accessHash = createHash('sha256').update(accessToken ?? '').digest('hex');
    if (accessToken) this.db.raw.prepare("UPDATE demo_sessions SET mode='fake'").run();
  }

  verifyToken(value: string): boolean {
    if (!this.accessToken) return false;
    const expected = Buffer.from(this.accessToken);
    const supplied = Buffer.from(value);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  create(): SessionRow {
    const id = randomBytes(32).toString('hex');
    const wearerId = `demo-${randomBytes(16).toString('hex')}`;
    this.db.raw.prepare("INSERT INTO demo_sessions(id,wearer_id,mode,calls,access_hash,created_at) VALUES (?,?,'fake',0,?,?)").run(id, wearerId, this.accessHash, new Date().toISOString());
    return { id, wearer_id: wearerId, mode: 'fake', calls: 0 };
  }

  fromCookie(header: string | undefined): SessionRow | null {
    const id = header?.split(';').map(part => part.trim()).find(part => part.startsWith('anmai_session='))?.slice('anmai_session='.length);
    if (!id || !/^[0-9a-f]{64}$/.test(id)) return null;
    return this.db.raw.prepare('SELECT id,wearer_id,mode,calls FROM demo_sessions WHERE id=? AND access_hash=?').get(id, this.accessHash) as SessionRow | undefined ?? null;
  }

  forWearer(wearerId: string): SessionRow | null {
    return this.db.raw.prepare('SELECT id,wearer_id,mode,calls FROM demo_sessions WHERE wearer_id=? AND access_hash=?').get(wearerId, this.accessHash) as SessionRow | undefined ?? null;
  }

  mode(wearerId: string): ProviderMode { return this.forWearer(wearerId)?.mode ?? 'fake'; }
  status(wearerId: string) { const row = this.forWearer(wearerId); const total = (this.db.raw.prepare('SELECT COALESCE(SUM(calls),0) AS count FROM demo_sessions WHERE access_hash=?').get(this.accessHash) as { count: number }).count; return { mode: row?.mode ?? 'fake', deepseekConfigured: this.deepseekConfigured, remaining: row ? Math.max(0, Math.min(this.sessionLimit - row.calls, this.globalLimit - total)) : 0 }; }
  enter(wearerId: string): () => void { this.active.set(wearerId, (this.active.get(wearerId) ?? 0) + 1); return () => { const count = (this.active.get(wearerId) ?? 1) - 1; if (count) this.active.set(wearerId, count); else this.active.delete(wearerId); }; }

  switch(wearerId: string, mode: ProviderMode): 'ok' | 'missing_key' | 'busy' | 'quota' {
    if (mode === 'deepseek' && !this.deepseekConfigured) return 'missing_key';
    if (mode === 'deepseek' && this.status(wearerId).remaining === 0) return 'quota';
    if (this.active.has(wearerId) || this.db.raw.prepare('SELECT 1 FROM emergency_events WHERE wearer_id=? AND closed_at IS NULL').get(wearerId) || this.db.raw.prepare("SELECT 1 FROM risk_review_state WHERE wearer_id=? AND status IN ('pending','observe')").get(wearerId)) return 'busy';
    this.db.raw.prepare('UPDATE demo_sessions SET mode=? WHERE wearer_id=?').run(mode, wearerId);
    return 'ok';
  }

  consume(wearerId: string): void {
    this.db.transaction(() => {
      const row = this.forWearer(wearerId);
      if (!row || row.calls >= this.sessionLimit) throw new Error('DeepSeek demo session quota exhausted');
      const total = (this.db.raw.prepare('SELECT COALESCE(SUM(calls),0) AS count FROM demo_sessions WHERE access_hash=?').get(this.accessHash) as { count: number }).count;
      if (total >= this.globalLimit) throw new Error('DeepSeek demo global quota exhausted');
      this.db.raw.prepare('UPDATE demo_sessions SET calls=calls+1 WHERE wearer_id=?').run(wearerId);
    });
  }
}
