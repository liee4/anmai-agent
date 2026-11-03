export interface Clock { now(): Date }
export class SystemClock implements Clock { now(): Date { return new Date(); } }
export class FakeClock implements Clock {
  constructor(private instant: Date) {}
  now(): Date { return new Date(this.instant); }
  advance(milliseconds: number): void { this.instant = new Date(this.instant.getTime() + milliseconds); }
}
