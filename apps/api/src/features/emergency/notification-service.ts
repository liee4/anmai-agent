import type { ContactDelivery, EmergencyEvent } from '@anmai/contracts';
import type { Clock } from '../../clock.js';
import type { DatabaseContext } from '../../infra/database.js';

type DemoOutcome = 'deliver' | 'fail_once' | 'fail_always';
type Phase = ContactDelivery['phase'];
interface ContactRow { contact_id: string; role: 'primary' | 'other'; label: string; outcome: DemoOutcome }
interface DeliveryRow { idempotency_key: string; event_id: string; contact_id: string; phase: Phase; status: ContactDelivery['status']; attempts: number; retry_at: string | null; wearer_id: string; outcome: DemoOutcome }

export class NotificationService {
  constructor(private readonly db: DatabaseContext, private readonly clock: Clock) {}

  setDemoOutcome(wearerId: string, contactId: string, outcome: DemoOutcome): void {
    if (!['primary', 'other-1', 'other-2'].includes(contactId)) throw new Error('Unknown demo contact');
    const role = contactId === 'primary' ? 'primary' : 'other';
    const label = contactId === 'primary' ? '主要亲属' : contactId === 'other-1' ? '其他亲属 1' : '其他亲属 2';
    this.db.raw.prepare('INSERT INTO demo_contacts(wearer_id,contact_id,role,label,outcome) VALUES (?,?,?,?,?) ON CONFLICT(wearer_id,contact_id) DO UPDATE SET outcome=excluded.outcome').run(wearerId, contactId, role, label, outcome);
  }

  notify(event: EmergencyEvent, phase: Phase): boolean {
    this.ensureDefaults(event.wearerId);
    const role = phase === 'primary_contact' ? 'primary' : 'other';
    const contacts = this.db.raw.prepare('SELECT contact_id,role,label,outcome FROM demo_contacts WHERE wearer_id=? AND role=? ORDER BY contact_id').all(event.wearerId, role) as unknown as ContactRow[];
    for (const contact of contacts) {
      const failed = contact.outcome !== 'deliver';
      const now = this.clock.now().toISOString();
      this.db.raw.prepare('INSERT OR IGNORE INTO contact_deliveries(idempotency_key,event_id,contact_id,phase,status,attempts,retry_at,updated_at,payload_json) VALUES (?,?,?,?,?,1,?,?,?)').run(`${event.eventId}:${contact.contact_id}:${phase}`, event.eventId, contact.contact_id, phase, failed ? 'delivery_failed' : 'delivered', failed ? new Date(this.clock.now().getTime() + 5_000).toISOString() : null, now, JSON.stringify({ wearerId: event.wearerId, location: event.location, simulated: true }));
    }
    return this.allFailed(event.eventId, phase);
  }

  list(eventId: string): ContactDelivery[] {
    return (this.db.raw.prepare('SELECT d.contact_id,d.phase,d.status,d.attempts,d.retry_at,c.role,c.label FROM contact_deliveries d JOIN emergency_events e ON e.event_id=d.event_id JOIN demo_contacts c ON c.wearer_id=e.wearer_id AND c.contact_id=d.contact_id WHERE d.event_id=? ORDER BY CASE c.role WHEN \'primary\' THEN 0 ELSE 1 END,c.contact_id').all(eventId) as { contact_id: string; phase: Phase; status: ContactDelivery['status']; attempts: number; retry_at: string | null; role: ContactDelivery['role']; label: string }[]).map(row => ({ contactId: row.contact_id, role: row.role, label: row.label, phase: row.phase, status: row.status, attempts: row.attempts, retryAt: row.retry_at }));
  }

  mark(eventId: string, contactId: string, status: 'declined' | 'taken_over' | 'timeout'): boolean {
    const result = this.db.raw.prepare("UPDATE contact_deliveries SET status=?,retry_at=NULL,updated_at=? WHERE event_id=? AND contact_id=? AND status='delivered'").run(status, this.clock.now().toISOString(), eventId, contactId);
    return result.changes > 0;
  }

  markPhase(eventId: string, phase: Phase, status: 'declined' | 'taken_over' | 'timeout'): void {
    if (status === 'taken_over') {
      const first = this.list(eventId).find(item => item.phase === phase && item.status === 'delivered');
      if (first) this.mark(eventId, first.contactId, status);
      return;
    }
    this.db.raw.prepare("UPDATE contact_deliveries SET status=?,retry_at=NULL,updated_at=? WHERE event_id=? AND phase=? AND status='delivered'").run(status, this.clock.now().toISOString(), eventId, phase);
  }

  allFailed(eventId: string, phase: Phase): boolean {
    const rows = this.list(eventId).filter(item => item.phase === phase);
    return rows.length > 0 && rows.every(item => item.status === 'delivery_failed' || item.status === 'declined' || item.status === 'timeout');
  }

  retryDue(): number {
    const now = this.clock.now().toISOString();
    const rows = this.db.raw.prepare("SELECT d.idempotency_key,d.event_id,d.contact_id,d.phase,d.status,d.attempts,d.retry_at,e.wearer_id,c.outcome FROM contact_deliveries d JOIN emergency_events e ON e.event_id=d.event_id JOIN demo_contacts c ON c.wearer_id=e.wearer_id AND c.contact_id=d.contact_id WHERE d.status='delivery_failed' AND d.attempts<2 AND d.retry_at<=?").all(now) as unknown as DeliveryRow[];
    for (const row of rows) {
      this.db.raw.prepare('UPDATE contact_deliveries SET attempts=2,status=?,retry_at=NULL,updated_at=? WHERE idempotency_key=? AND attempts=1').run(row.outcome === 'fail_once' ? 'delivered' : 'delivery_failed', now, row.idempotency_key);
    }
    return rows.length;
  }

  private ensureDefaults(wearerId: string): void {
    for (const contactId of ['primary', 'other-1', 'other-2']) {
      const role = contactId === 'primary' ? 'primary' : 'other';
      const label = contactId === 'primary' ? '主要亲属' : contactId === 'other-1' ? '其他亲属 1' : '其他亲属 2';
      this.db.raw.prepare("INSERT OR IGNORE INTO demo_contacts(wearer_id,contact_id,role,label,outcome) VALUES (?,?,?,?,'deliver')").run(wearerId, contactId, role, label);
    }
  }
}
