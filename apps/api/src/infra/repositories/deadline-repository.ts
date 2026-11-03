import type { DatabaseContext } from '../database.js';

export interface Deadline { id: string; eventId: string; kind: string; dueAt: string }

export class DeadlineRepository {
  constructor(private readonly db: DatabaseContext) {}

  schedule(deadline: Deadline): void {
    this.db.raw.prepare("INSERT INTO deadlines(id, event_id, kind, due_at, status) VALUES (?, ?, ?, ?, 'pending')").run(deadline.id, deadline.eventId, deadline.kind, deadline.dueAt);
  }

  listDue(now: string): Deadline[] {
    const rows = this.db.raw.prepare("SELECT id, event_id, kind, due_at FROM deadlines WHERE status = 'pending' AND due_at <= ? ORDER BY due_at, id").all(now) as { id: string; event_id: string; kind: string; due_at: string }[];
    return rows.map(row => ({ id: row.id, eventId: row.event_id, kind: row.kind, dueAt: row.due_at }));
  }

  claim(id: string): boolean {
    return this.db.raw.prepare("UPDATE deadlines SET status = 'claimed' WHERE id = ? AND status = 'pending'").run(id).changes === 1;
  }

  cancelForEvent(eventId: string): void {
    this.db.raw.prepare("UPDATE deadlines SET status = 'cancelled' WHERE event_id = ? AND status = 'pending'").run(eventId);
  }
}
