export interface BusEvent { id: number; type: string; data: unknown }

export class EventBus {
  private nextId = 1;
  private readonly history: BusEvent[] = [];
  private readonly listeners = new Set<(event: BusEvent) => void>();

  publish(type: string, data: unknown): BusEvent {
    const event = { id: this.nextId++, type, data };
    this.history.push(event);
    if (this.history.length > 100) this.history.shift();
    for (const listener of this.listeners) listener(event);
    return event;
  }

  subscribe(listener: (event: BusEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  since(id: number): BusEvent[] { return this.history.filter(event => event.id > id); }
}
