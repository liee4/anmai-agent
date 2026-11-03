import { randomUUID } from 'node:crypto';
import type { EmergencyEvent, RiskAssessment, TimerSettings, VitalSample } from '@anmai/contracts';
import type { Clock } from '../../clock.js';
import type { DatabaseContext } from '../../infra/database.js';
import { DeadlineRepository } from '../../infra/repositories/deadline-repository.js';
import { EmergencyRepository } from '../../infra/repositories/emergency-repository.js';
import { createEvent, reduceEmergencyState, type EmergencyCommand } from './state-machine.js';
import type { PersonalBaseline } from '../monitoring/risk-detector.js';
import { BaselineExclusionRepository } from '../../infra/repositories/baseline-exclusion-repository.js';

export const defaultTimerSettings: TimerSettings = { wearerResponseSeconds: 60, primaryRelativeSeconds: 30, otherRelativesSeconds: 30, safeRecheckSeconds: 300 };

export class EmergencyService {
  private readonly events: EmergencyRepository;
  private readonly deadlines: DeadlineRepository;

  constructor(private readonly db: DatabaseContext, private readonly clock: Clock, private settings: TimerSettings = defaultTimerSettings) {
    this.events = new EmergencyRepository(db);
    this.deadlines = new DeadlineRepository(db);
  }

  getSettings(): TimerSettings { return { ...this.settings }; }

  getMonitorState(wearerId: string): { confirmedAt: string; recheckAt: string; recheckCount: number } | null {
    const row = this.db.raw.prepare('SELECT confirmed_at, recheck_at, recheck_count FROM wearer_monitor_state WHERE wearer_id = ?').get(wearerId) as { confirmed_at: string; recheck_at: string; recheck_count: number } | undefined;
    return row ? { confirmedAt: row.confirmed_at, recheckAt: row.recheck_at, recheckCount: row.recheck_count } : null;
  }

  observeRisk(wearerId: string, risk: RiskAssessment): 'new' | 'suppress' | 'recheck' | 'worsening' {
    const row = this.db.raw.prepare('SELECT fingerprint_json, recheck_at, recheck_count, normal_since FROM wearer_monitor_state WHERE wearer_id = ?').get(wearerId) as { fingerprint_json: string; recheck_at: string; recheck_count: number; normal_since: string | null } | undefined;
    if (!row) return 'new';
    const now = this.clock.now().toISOString();
    if (risk.level === 'untrusted_data') return 'suppress';
    if (risk.level === 'normal') {
      if (!row.normal_since) this.db.raw.prepare('UPDATE wearer_monitor_state SET normal_since = ? WHERE wearer_id = ?').run(now, wearerId);
      else if (Date.parse(now) - Date.parse(row.normal_since) >= 60_000) this.db.raw.prepare('DELETE FROM wearer_monitor_state WHERE wearer_id = ?').run(wearerId);
      return 'suppress';
    }
    if (row.normal_since) this.db.raw.prepare('UPDATE wearer_monitor_state SET normal_since = NULL WHERE wearer_id = ?').run(wearerId);
    const previous = JSON.parse(row.fingerprint_json) as RiskAssessment;
    if (risk.level === 'worsening' || risk.score >= previous.score + 2) {
      this.db.raw.prepare('DELETE FROM wearer_monitor_state WHERE wearer_id = ?').run(wearerId);
      return 'worsening';
    }
    if (row.recheck_count === 0 && Date.parse(now) >= Date.parse(row.recheck_at)) {
      this.db.raw.prepare('UPDATE wearer_monitor_state SET recheck_count = 1 WHERE wearer_id = ?').run(wearerId);
      return 'recheck';
    }
    return 'suppress';
  }

  observeActiveRisk(event: EmergencyEvent, risk: RiskAssessment): EmergencyEvent {
    const now = this.clock.now().toISOString();
    const row = this.db.raw.prepare('SELECT normal_since FROM event_health_state WHERE event_id = ?').get(event.eventId) as { normal_since: string | null } | undefined;
    const normalSince = risk.level === 'normal' ? row?.normal_since ?? now : null;
    this.db.raw.prepare('INSERT INTO event_health_state(event_id, last_risk_json, normal_since) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET last_risk_json = excluded.last_risk_json, normal_since = excluded.normal_since').run(event.eventId, JSON.stringify(risk), normalSince);
    if (event.state === 'wearer_alert' && normalSince && Date.parse(now) - Date.parse(normalSince) >= 10_000) {
      return this.act(event.eventId, event.stateVersion, { kind: 'close' }).event ?? event;
    }
    if (row?.normal_since === null && risk.level === 'normal' && event.state !== 'wearer_alert') this.appendTimeline(event.eventId, 'vitals_recovered', '当前体征已恢复，等待亲属接管');
    return event;
  }

  setSettings(settings: TimerSettings): boolean {
    if (this.db.raw.prepare('SELECT 1 FROM emergency_events WHERE closed_at IS NULL LIMIT 1').get()) return false;
    this.settings = { ...settings };
    return true;
  }

  start(wearerId: string, risk: RiskAssessment, baselineVersion: number | null = null, location: VitalSample['location'] = undefined, baselineSnapshot: PersonalBaseline = {}): EmergencyEvent {
    return this.db.transaction(() => {
      const active = this.events.getActiveForWearer(wearerId);
      if (active) return active;
      const event = { ...createEvent(randomUUID(), wearerId, risk, this.settings, this.clock.now(), baselineVersion, baselineSnapshot), location: location ?? null };
      this.events.create(event);
      this.db.raw.prepare('INSERT INTO event_health_state(event_id, last_risk_json) VALUES (?, ?)').run(event.eventId, JSON.stringify(risk));
      this.appendTimeline(event.eventId, 'wearer_alert', '已询问佩戴者');
      this.schedule(event);
      return event;
    });
  }

  get(eventId: string): EmergencyEvent | null { return this.events.get(eventId); }
  getActiveForWearer(wearerId: string): EmergencyEvent | null { return this.events.getActiveForWearer(wearerId); }
  getTimeline(eventId: string): { at: string; kind: string; detail: string }[] {
    return this.db.raw.prepare('SELECT at, kind, detail_json FROM event_timeline WHERE event_id = ? ORDER BY at, rowid').all(eventId).map(row => {
      const entry = row as { at: string; kind: string; detail_json: string };
      return { at: entry.at, kind: entry.kind, detail: JSON.parse(entry.detail_json) as string };
    });
  }

  act(eventId: string, expectedVersion: number, command: EmergencyCommand): { ok: boolean; event: EmergencyEvent | null } {
    return this.db.transaction(() => {
      const current = this.events.get(eventId);
      if (!current || current.stateVersion !== expectedVersion) return { ok: false, event: current };
      if (command.kind === 'wearer_safe' && (current.state === 'primary_contact' || current.state === 'other_contacts')) {
        const health = this.db.raw.prepare('SELECT last_risk_json FROM event_health_state WHERE event_id = ?').get(eventId) as { last_risk_json: string } | undefined;
        const unwell = this.db.raw.prepare("SELECT 1 FROM event_timeline WHERE event_id = ? AND kind = 'wearer_unwell' LIMIT 1").get(eventId);
        if (unwell || (health && (JSON.parse(health.last_risk_json) as RiskAssessment).level === 'worsening')) return { ok: false, event: current };
      }
      const next = reduceEmergencyState(current, command, this.clock.now());
      if (next === current) return { ok: false, event: current };
      const result = this.events.transition(eventId, expectedVersion, next.state, next.deadlineAt);
      if (!result.ok) return result;
      this.appendTimeline(eventId, command.kind, `状态更新为 ${next.state}`);
      this.recordSimulation(current, result.event, command);
      if (command.kind === 'wearer_unwell') {
        this.db.raw.prepare("INSERT INTO baseline_state(wearer_id, status, paused_at, pause_reason) VALUES (?, 'paused', ?, 'wearer_unwell') ON CONFLICT(wearer_id) DO UPDATE SET status = 'paused', paused_at = excluded.paused_at, pause_reason = excluded.pause_reason").run(current.wearerId, this.clock.now().toISOString());
        new BaselineExclusionRepository(this.db).excludeRange(current.wearerId, current.createdAt, this.clock.now().toISOString(), 'wearer_unwell');
      }
      if (command.kind === 'wearer_safe') {
        const recheckAt = new Date(this.clock.now().getTime() + current.timerSettings.safeRecheckSeconds * 1000).toISOString();
        this.db.raw.prepare('INSERT INTO wearer_monitor_state(wearer_id, fingerprint_json, confirmed_at, recheck_at, recheck_count) VALUES (?, ?, ?, ?, 0) ON CONFLICT(wearer_id) DO UPDATE SET fingerprint_json = excluded.fingerprint_json, confirmed_at = excluded.confirmed_at, recheck_at = excluded.recheck_at').run(current.wearerId, JSON.stringify(current.risk), this.clock.now().toISOString(), recheckAt);
      }
      this.deadlines.cancelForEvent(eventId);
      this.schedule(result.event);
      return result;
    });
  }

  runDue(): number {
    let executed = 0;
    for (const deadline of this.deadlines.listDue(this.clock.now().toISOString())) {
      this.db.transaction(() => {
        if (!this.deadlines.claim(deadline.id)) return;
        const event = this.events.get(deadline.eventId);
        if (!event || event.deadlineAt !== deadline.dueAt) return;
        if (event.state === 'wearer_alert') {
          const health = this.db.raw.prepare('SELECT last_risk_json FROM event_health_state WHERE event_id = ?').get(event.eventId) as { last_risk_json: string } | undefined;
          if (health && (JSON.parse(health.last_risk_json) as RiskAssessment).level === 'normal') {
            if (this.act(event.eventId, event.stateVersion, { kind: 'close' }).ok) executed++;
            return;
          }
        }
        if (this.act(event.eventId, event.stateVersion, { kind: 'deadline' }).ok) executed++;
      });
    }
    return executed;
  }

  private schedule(event: EmergencyEvent): void {
    if (!event.deadlineAt) return;
    this.deadlines.schedule({ id: randomUUID(), eventId: event.eventId, kind: event.state, dueAt: event.deadlineAt });
  }

  private recordSimulation(previous: EmergencyEvent, current: EmergencyEvent, command: EmergencyCommand): void {
    const recipient = previous.state === 'primary_contact' ? 'primary-relative' : previous.state === 'other_contacts' ? 'other-relatives' : null;
    if (recipient && (command.kind === 'relative_decline' || command.kind === 'deadline' || command.kind === 'relative_takeover')) {
      const status = command.kind === 'relative_takeover' ? 'taken_over' : command.kind === 'deadline' ? 'timeout' : 'declined';
      this.db.raw.prepare('UPDATE simulated_deliveries SET status = ? WHERE idempotency_key = ?').run(status, `${previous.eventId}:${recipient}`);
    }
    const nextRecipient = current.state === 'primary_contact' && previous.state !== 'primary_contact' ? 'primary-relative' : current.state === 'other_contacts' && previous.state !== 'other_contacts' ? 'other-relatives' : current.state === 'simulated_call' && previous.state !== 'simulated_call' ? 'emergency-simulator' : null;
    if (!nextRecipient) return;
    const kind = nextRecipient === 'emergency-simulator' ? 'simulated_call' : 'relative_notification';
    const payload = { wearerId: current.wearerId, eventId: current.eventId, location: current.location, risk: current.risk, simulated: true };
    const inserted = this.db.raw.prepare('INSERT OR IGNORE INTO simulated_deliveries(idempotency_key, event_id, recipient, kind, status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${current.eventId}:${nextRecipient}`, current.eventId, nextRecipient, kind, 'delivered', JSON.stringify(payload), this.clock.now().toISOString());
    if (inserted.changes) this.appendTimeline(current.eventId, kind, nextRecipient === 'primary-relative' ? '已向主要亲属发送模拟通知' : nextRecipient === 'other-relatives' ? '已向其他亲属发送模拟通知' : '已发起模拟急救电话，不连接真实服务');
  }

  private appendTimeline(eventId: string, kind: string, detail: string): void {
    this.db.raw.prepare('INSERT INTO event_timeline(id, event_id, at, kind, detail_json) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), eventId, this.clock.now().toISOString(), kind, JSON.stringify(detail));
  }
}
