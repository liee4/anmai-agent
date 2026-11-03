import type { EmergencyEvent, EventState } from '@anmai/contracts';
import type { DatabaseContext } from '../database.js';

export type TransitionResult = { ok: true; event: EmergencyEvent } | { ok: false; event: EmergencyEvent | null };

export class EmergencyRepository {
  constructor(private readonly db: DatabaseContext) {}

  create(event: EmergencyEvent): void {
    this.db.raw.prepare('INSERT INTO emergency_events(event_id, wearer_id, state, state_version, event_json, deadline_at, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      event.eventId, event.wearerId, event.state, event.stateVersion, JSON.stringify(event), event.deadlineAt, event.createdAt, event.state === 'closed' ? event.createdAt : null,
    );
  }

  get(eventId: string): EmergencyEvent | null {
    const row = this.db.raw.prepare('SELECT event_json FROM emergency_events WHERE event_id = ?').get(eventId) as { event_json: string } | undefined;
    return row ? JSON.parse(row.event_json) as EmergencyEvent : null;
  }

  transition(eventId: string, expectedVersion: number, nextState: EventState, deadlineAt: string | null): TransitionResult {
    const current = this.get(eventId);
    if (!current || current.stateVersion !== expectedVersion) return { ok: false, event: current };
    const event: EmergencyEvent = { ...current, state: nextState, stateVersion: current.stateVersion + 1, deadlineAt };
    const result = this.db.raw.prepare('UPDATE emergency_events SET state = ?, state_version = ?, event_json = ?, deadline_at = ?, closed_at = ? WHERE event_id = ? AND state_version = ?').run(
      nextState, event.stateVersion, JSON.stringify(event), deadlineAt, nextState === 'closed' ? new Date().toISOString() : null, eventId, expectedVersion,
    );
    return result.changes === 1 ? { ok: true, event } : { ok: false, event: this.get(eventId) };
  }
}

