import type { IntervalUnit } from './types';

export interface RecurrenceRule {
  interval_unit: IntervalUnit;
  interval_count: number;
  /** Day of month (1–31) for monthly/yearly items; months without that day use their last day. */
  due_day: number | null;
  /** Due on the last day of the month (monthly/yearly items). */
  due_last_day: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Anchored date within the month that is `monthOffset` months after (y, m). */
function anchoredInMonth(y: number, m: number, monthOffset: number, rule: RecurrenceRule, fallbackDay: number): string {
  const target = new Date(Date.UTC(y, m + monthOffset, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const last = daysInMonth(ty, tm);
  const day = rule.due_last_day ? last : Math.min(rule.due_day ?? fallbackDay, last);
  return ymd(ty, tm, day);
}

function monthsPerStep(rule: RecurrenceRule): number {
  return rule.interval_unit === 'year' ? 12 * rule.interval_count : rule.interval_count;
}

/** Next due date after `fromIso`. Mirrors public.next_recurring_date() in the database. */
export function nextDueDate(fromIso: string, rule: RecurrenceRule): string {
  const [y, m, d] = parts(fromIso);
  if (rule.interval_unit === 'week') {
    const dt = new Date(Date.UTC(y, m, d + 7 * rule.interval_count));
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }
  // Unanchored items behave like Postgres "date + N months" (clamped to the month's end).
  return anchoredInMonth(y, m, monthsPerStep(rule), rule, d);
}

/**
 * First anchored due date on or after `fromIso` (used when creating an item or changing its day).
 * Monthly items move to the next month if this month's date has passed; yearly items to next year.
 */
export function firstDueOnOrAfter(fromIso: string, rule: RecurrenceRule): string {
  if (rule.interval_unit === 'week' || (!rule.due_last_day && rule.due_day === null)) return fromIso;
  const [y, m] = parts(fromIso);
  const candidate = anchoredInMonth(y, m, 0, rule, 1);
  if (candidate >= fromIso) return candidate;
  return anchoredInMonth(y, m, rule.interval_unit === 'year' ? 12 : 1, rule, 1);
}

/** The next `count` due dates starting with `firstIso`. */
export function upcomingDueDates(firstIso: string, rule: RecurrenceRule, count: number): string[] {
  const dates = [firstIso];
  while (dates.length < count) dates.push(nextDueDate(dates[dates.length - 1], rule));
  return dates;
}

const UNIT_LABEL: Record<IntervalUnit, string> = { week: 'สัปดาห์', month: 'เดือน', year: 'ปี' };

/** e.g. "ทุกเดือน · วันที่ 25", "ทุก 3 เดือน · วันสุดท้ายของเดือน". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const every =
    rule.interval_count === 1
      ? `ทุก${UNIT_LABEL[rule.interval_unit]}`
      : `ทุก ${rule.interval_count} ${UNIT_LABEL[rule.interval_unit]}`;
  if (rule.interval_unit === 'week') return every;
  if (rule.due_last_day) return `${every} · วันสุดท้ายของเดือน`;
  if (rule.due_day) return `${every} · วันที่ ${rule.due_day}`;
  return every;
}
