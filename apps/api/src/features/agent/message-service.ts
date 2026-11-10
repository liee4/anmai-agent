import type { EmergencyEvent, EventMessages } from '@anmai/contracts';
import type { Clock } from '../../clock.js';
import type { DatabaseContext } from '../../infra/database.js';
import type { MessageProvider, MessageContent } from './message-provider.js';
import { fallbackMessages } from './message-provider.js';

export class MessageService {
  constructor(private readonly db: DatabaseContext, private readonly clock: Clock, private readonly provider: MessageProvider, private readonly providerName: string | ((wearerId: string) => string)) {}

  get(eventId: string, state: EmergencyEvent['state']): EventMessages | null {
    const row = this.db.raw.prepare('SELECT bundle_json,provider,status FROM event_messages WHERE event_id=? AND state=?').get(eventId, state) as { bundle_json: string; provider: string; status: EventMessages['status'] } | undefined;
    return row ? { ...JSON.parse(row.bundle_json) as MessageContent, provider: row.provider, status: row.status } : null;
  }

  async ensure(event: EmergencyEvent): Promise<EventMessages> {
    const fallback = fallbackMessages(event);
    const initial = this.db.raw.prepare("INSERT OR IGNORE INTO event_messages(event_id,state,provider,status,bundle_json,updated_at) VALUES (?,?,'local','pending',?,?)").run(event.eventId, event.state, JSON.stringify(fallback), this.clock.now().toISOString());
    if (!initial.changes || Object.keys(fallback).length === 0) return this.get(event.eventId, event.state)!;
    let bundle: MessageContent;
    try {
      const generated = await this.provider.compose({ event, fallback });
      if (Object.keys(generated).some(key => !(key in fallback)) || Object.keys(fallback).some(key => typeof generated[key as keyof MessageContent] !== 'string' || !generated[key as keyof MessageContent]!.trim() || generated[key as keyof MessageContent]!.length > 300)) throw new Error('Invalid message');
      bundle = generated;
    } catch {
      this.db.raw.prepare("UPDATE event_messages SET status='fallback',updated_at=? WHERE event_id=? AND state=?").run(this.clock.now().toISOString(), event.eventId, event.state);
      return this.get(event.eventId, event.state)!;
    }
    this.db.raw.prepare("UPDATE event_messages SET provider=?,status='generated',bundle_json=?,updated_at=? WHERE event_id=? AND state=?").run(typeof this.providerName === 'function' ? this.providerName(event.wearerId) : this.providerName, JSON.stringify(bundle), this.clock.now().toISOString(), event.eventId, event.state);
    return this.get(event.eventId, event.state)!;
  }
}
