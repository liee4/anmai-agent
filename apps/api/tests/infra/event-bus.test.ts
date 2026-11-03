import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/infra/event-bus.js';

describe('event bus', () => {
  it('keeps ordered IDs and replays events after a cursor', () => {
    const bus = new EventBus();
    const received: number[] = [];
    const unsubscribe = bus.subscribe(event => received.push(event.id));
    bus.publish('monitoring', { wearerId: 'w' });
    bus.publish('event', { eventId: 'e' });
    unsubscribe();
    bus.publish('baseline', { version: 1 });
    expect(received).toEqual([1, 2]);
    expect(bus.since(1).map(event => event.id)).toEqual([2, 3]);
  });
});
