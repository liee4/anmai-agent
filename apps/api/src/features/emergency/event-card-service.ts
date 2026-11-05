import type { EventCard, VitalSample } from '@anmai/contracts';
import type { DatabaseContext } from '../../infra/database.js';

export class EventCardService {
  constructor(private readonly db: DatabaseContext) {}

  record(eventId: string, samples: VitalSample[]): void {
    if (!samples.length) return;
    const ordered = [...samples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-60);
    this.db.raw.prepare('INSERT INTO event_card_samples(event_id,samples_json,updated_at) VALUES (?,?,?) ON CONFLICT(event_id) DO UPDATE SET samples_json=excluded.samples_json,updated_at=excluded.updated_at').run(eventId, JSON.stringify(ordered), new Date().toISOString());
  }

  get(eventId: string): EventCard | null {
    const event = this.db.raw.prepare('SELECT event_id FROM emergency_events WHERE event_id=?').get(eventId);
    if (!event) return null;
    const row = this.db.raw.prepare('SELECT samples_json FROM event_card_samples WHERE event_id=?').get(eventId) as { samples_json: string } | undefined;
    const samples = row ? JSON.parse(row.samples_json) as VitalSample[] : [];
    const first = samples[0];
    const latest = samples.at(-1) ?? null;
    const delta = (key: 'heartRate' | 'spo2' | 'systolicBP') => first?.[key] !== undefined && latest?.[key] !== undefined ? latest[key] - first[key] : null;
    const response = this.db.raw.prepare("SELECT kind FROM event_timeline WHERE event_id=? AND kind IN ('wearer_unwell','wearer_safe') ORDER BY rowid DESC LIMIT 1").get(eventId) as { kind: string } | undefined;
    return { eventId, name: null, age: null, medicalHistory: null, allergies: null, latest, trend: { heartRateDelta: delta('heartRate'), spo2Delta: delta('spo2'), systolicBPDelta: delta('systolicBP') }, wearerFeedback: response?.kind === 'wearer_unwell' ? '表示不舒服，需要亲属' : response?.kind === 'wearer_safe' ? '表示我没事' : '未回应' };
  }
}
