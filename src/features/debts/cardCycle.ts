import { addDays } from '../../lib/format';
import { firstDueOnOrAfter } from '../../lib/recurrence';

function monthlyOn(day: number) {
  return { interval_unit: 'month' as const, interval_count: 1, due_day: day, due_last_day: false };
}

/** The statement (cut-off) date a transaction on `dateIso` lands on. The cut-off day itself is included. */
export function statementDateFor(dateIso: string, statementDay: number): string {
  return firstDueOnOrAfter(dateIso, monthlyOn(statementDay));
}

/** Payment due date of a statement: the first `dueDay` after the cut-off. */
export function dueDateForStatement(statementIso: string, dueDay: number): string {
  return firstDueOnOrAfter(addDays(statementIso, 1), monthlyOn(dueDay));
}

/** Most recent cut-off on or before `todayIso`. */
export function previousStatementDate(todayIso: string, statementDay: number): string {
  const upcoming = statementDateFor(todayIso, statementDay);
  if (upcoming === todayIso) return todayIso;
  const [y, m] = upcoming.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth();
  const last = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
  return `${py}-${String(pm + 1).padStart(2, '0')}-${String(Math.min(statementDay, last)).padStart(2, '0')}`;
}
