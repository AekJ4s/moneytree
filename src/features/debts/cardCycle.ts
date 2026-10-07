import { addDays } from '../../lib/format';
import { firstDueOnOrAfter } from '../../lib/recurrence';
import type { Debt, DebtEntry } from './types';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

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

export interface CardCycle {
  /** Last statement cut-off and what is still owed from it. */
  lastStatement: string;
  billed: number;
  billedDue: string | null;
  /** Spending after the last cut-off; it goes on the next statement. */
  nextStatement: string;
  unbilled: number;
  unbilledDue: string | null;
}

/**
 * Splits a card balance into the part already on a statement (to pay by its due date)
 * and the part that will appear on the next statement.
 */
export function cardCycle(debt: Debt, entries: DebtEntry[], todayIso: string): CardCycle | null {
  if (!debt.statement_day) return null;
  const lastStatement = previousStatementDate(todayIso, debt.statement_day);
  const nextStatement = statementDateFor(addDays(todayIso, 1), debt.statement_day);

  const signed = (e: DebtEntry) => (e.kind === 'payment' ? -1 : 1) * Number(e.amount);
  const opening = debt.start_date <= lastStatement ? Number(debt.principal) : 0;
  const balanceAtCutoff = entries.filter((e) => e.entry_date <= lastStatement).reduce((s, e) => s + signed(e), opening);
  const paidSince = entries
    .filter((e) => e.entry_date > lastStatement && e.kind === 'payment')
    .reduce((s, e) => s + Number(e.amount), 0);
  const total = entries.reduce((s, e) => s + signed(e), Number(debt.principal));

  const billed = Math.max(0, round2(balanceAtCutoff - paidSince));
  const unbilled = Math.max(0, round2(total - billed));
  const due = (statement: string) => (debt.due_day ? dueDateForStatement(statement, debt.due_day) : null);
  return {
    lastStatement,
    billed,
    billedDue: billed > 0 ? due(lastStatement) : null,
    nextStatement,
    unbilled,
    unbilledDue: unbilled > 0 ? due(nextStatement) : null,
  };
}
