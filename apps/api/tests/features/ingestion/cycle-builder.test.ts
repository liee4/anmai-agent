import { describe, expect, it } from 'vitest';
import { buildCycles } from '../../../src/features/ingestion/cycle-builder.js';
import type { DailySummary } from '@anmai/contracts';

const day = (date: string, eligible = true): DailySummary => ({ wearerId: 'wearer-1', date, coverageHours: eligible ? 8 : 1, qualityRate: 1, restingHours: eligible ? 2 : 0, baselineEligible: eligible, exclusionReasons: eligible ? [] : ['insufficient_coverage'] });
const dates = (count: number) => Array.from({ length: count }, (_, index) => new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10));

describe('baseline cycles', () => {
  it('waits for a complete 14-calendar-day window', () => {
    expect(buildCycles(dates(13).map(date => day(date)))).toHaveLength(0);
  });

  it('accepts seven eligible days in a complete window', () => {
    const result = buildCycles(dates(14).map((date, index) => day(date, index < 7)));
    expect(result).toMatchObject([{ startDate: '2026-10-01', endDate: '2026-10-14', validDays: 7, eligible: true }]);
  });

  it('creates nonoverlapping windows in chronological order', () => {
    const result = buildCycles(dates(28).reverse().map(date => day(date)));
    expect(result.map(cycle => [cycle.startDate, cycle.endDate])).toEqual([['2026-10-01', '2026-10-14'], ['2026-10-15', '2026-10-28']]);
  });
});
