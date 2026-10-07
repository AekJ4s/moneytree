import { describe, expect, it } from 'vitest';
import { describeRecurrence, firstDueOnOrAfter, nextDueDate, upcomingDueDates, type RecurrenceRule } from './recurrence';

const monthly = (due_day: number | null, due_last_day = false, interval_count = 1): RecurrenceRule => ({
  interval_unit: 'month',
  interval_count,
  due_day,
  due_last_day,
});

// Same cases as the SQL check of public.next_recurring_date().
describe('nextDueDate', () => {
  it.each([
    ['2026-01-31', monthly(31), '2026-02-28'],
    ['2026-02-28', monthly(31), '2026-03-31'],
    ['2028-01-31', monthly(31), '2028-02-29'],
    ['2026-01-31', monthly(null, true), '2026-02-28'],
    ['2026-02-28', monthly(null, true), '2026-03-31'],
    ['2026-10-25', monthly(25, false, 3), '2027-01-25'],
    ['2026-11-30', monthly(null, true, 3), '2027-02-28'],
    ['2026-02-28', { interval_unit: 'year', interval_count: 1, due_day: 29, due_last_day: false } as RecurrenceRule, '2027-02-28'],
    ['2026-10-07', { interval_unit: 'week', interval_count: 2, due_day: null, due_last_day: false } as RecurrenceRule, '2026-10-21'],
    ['2026-01-15', monthly(null), '2026-02-15'],
  ])('%s → %s', (from, rule, expected) => {
    expect(nextDueDate(from, rule)).toBe(expected);
  });
});

describe('firstDueOnOrAfter', () => {
  it('uses this month when the day is still ahead', () => {
    expect(firstDueOnOrAfter('2026-10-07', monthly(25))).toBe('2026-10-25');
    expect(firstDueOnOrAfter('2026-10-07', monthly(null, true))).toBe('2026-10-31');
    expect(firstDueOnOrAfter('2026-10-25', monthly(25))).toBe('2026-10-25');
  });
  it('moves to next month when the day has passed', () => {
    expect(firstDueOnOrAfter('2026-10-07', monthly(5))).toBe('2026-11-05');
    expect(firstDueOnOrAfter('2027-01-31', monthly(30))).toBe('2027-02-28');
  });
  it('leaves weekly and unanchored items alone', () => {
    expect(firstDueOnOrAfter('2026-10-07', monthly(null))).toBe('2026-10-07');
  });
});

describe('upcomingDueDates', () => {
  it('keeps the anchor day through short months', () => {
    expect(upcomingDueDates('2026-12-31', monthly(31), 4)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });
  it('steps every N months', () => {
    expect(upcomingDueDates('2026-10-31', monthly(null, true, 3), 3)).toEqual(['2026-10-31', '2027-01-31', '2027-04-30']);
  });
});

describe('describeRecurrence', () => {
  it('describes anchors', () => {
    expect(describeRecurrence(monthly(25))).toBe('ทุกเดือน · วันที่ 25');
    expect(describeRecurrence(monthly(null, true, 3))).toBe('ทุก 3 เดือน · วันสุดท้ายของเดือน');
  });
});
