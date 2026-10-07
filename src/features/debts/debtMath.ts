import { firstDueOnOrAfter, nextDueDate } from '../../lib/recurrence';
import type { Debt, DebtEntry, DebtInstallment, InterestMethod, InterestMode } from './types';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Monthly interest rate as a fraction (e.g. 16% per year -> 0.01333). Manual/none -> 0. */
export function monthlyRate(mode: InterestMode, ratePercent: number | null): number {
  const rate = Number(ratePercent ?? 0) / 100;
  if (mode === 'annual') return rate / 12;
  if (mode === 'monthly') return rate;
  return 0;
}

export interface ScheduleInput {
  principal: number;
  termMonths: number;
  interestMode: InterestMode;
  interestRate: number | null;
  interestMethod: InterestMethod;
  firstDueDate: string;
  /** Bank-style fixed payment per installment; principal = payment - interest. */
  fixedPayment?: number | null;
}

export interface ScheduleRow {
  seq: number;
  due_date: string;
  principal: number;
  interest: number;
}

/** A schedule row as far as rebalancing is concerned. Locked rows (paid or confirmed) are kept as-is. */
export interface BalanceRow {
  principal: number;
  interest: number;
  locked: boolean;
}

/**
 * Recomputes unlocked rows of a fixed-payment schedule, in order:
 * interest is estimated on the remaining principal, principal = payment - interest,
 * and the last row takes whatever principal remains so the loan closes exactly.
 * Locked rows (values from a statement, or already paid) are never changed.
 */
export function rebalanceFixedPayment<T extends BalanceRow>(
  rows: T[],
  totalPrincipal: number,
  payment: number,
  rate: number,
): T[] {
  let remaining = round2(totalPrincipal);
  return rows.map((row, idx) => {
    if (row.locked) {
      remaining = round2(remaining - Number(row.principal));
      return row;
    }
    const last = idx === rows.length - 1;
    const interest = round2(Math.max(0, remaining) * rate);
    const principal = last
      ? Math.max(0, remaining)
      : Math.min(Math.max(0, remaining), Math.max(0, round2(payment - interest)));
    remaining = round2(remaining - principal);
    return { ...row, principal: round2(principal), interest };
  });
}

/** Standard amortised payment (equal installments, interest on the remaining balance). */
export function amortizedPayment(principal: number, termMonths: number, rate: number): number {
  return round2(rate > 0 ? (principal * rate) / (1 - (1 + rate) ** -termMonths) : principal / termMonths);
}

/**
 * Builds an installment schedule.
 * - flat: interest is charged on the original principal every month (common for Thai installments/PayLater);
 * - reducing: equal payments, interest on the remaining balance (amortised loan).
 * Rounding differences are absorbed by the last installment so principals sum exactly.
 * Due dates keep the first due date's day of month (31st -> end of shorter months).
 */
export function buildSchedule(input: ScheduleInput): ScheduleRow[] {
  const n = input.termMonths;
  const P = input.principal;
  const r = monthlyRate(input.interestMode, input.interestRate);
  const day = Number(input.firstDueDate.slice(8, 10));
  const rule = { interval_unit: 'month' as const, interval_count: 1, due_day: day, due_last_day: false };

  const rows: ScheduleRow[] = [];
  let due = input.firstDueDate;
  let balance = P;
  const flatPrincipal = round2(P / n);
  const flatInterest = round2(P * r);
  const payment = r > 0 ? (P * r) / (1 - (1 + r) ** -n) : P / n;

  for (let seq = 1; seq <= n; seq += 1) {
    const last = seq === n;
    let principal: number;
    let interest: number;
    if (input.interestMethod === 'reducing') {
      interest = round2(balance * r);
      principal = last ? round2(balance) : round2(payment - interest);
    } else {
      interest = flatInterest;
      principal = last ? round2(balance) : flatPrincipal;
    }
    balance = round2(balance - principal);
    rows.push({ seq, due_date: due, principal, interest });
    due = nextDueDate(due, rule);
  }
  if (input.fixedPayment && input.fixedPayment > 0) {
    return rebalanceFixedPayment(
      rows.map((row) => ({ ...row, locked: false })),
      P,
      input.fixedPayment,
      r,
    ).map(({ locked: _locked, ...row }) => row);
  }
  return rows;
}

export interface DebtSummary {
  /** Everything still owed, including scheduled interest. */
  outstanding: number;
  remainingPrincipal: number;
  remainingInterest: number;
  totalInterest: number;
  paidCount: number;
  totalCount: number;
  nextDue: { date: string; amount: number; installmentId: string | null } | null;
  /** Amount due on or before the end of the given month (includes overdue). */
  dueThisMonth: number;
  overdueCount: number;
  /** Revolving only. */
  estimatedMonthlyInterest: number | null;
  minimumPayment: number | null;
  utilization: number | null;
}

function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

export function paidInstallmentIds(entries: DebtEntry[]): Set<string> {
  return new Set(entries.filter((e) => e.kind === 'payment' && e.installment_id).map((e) => e.installment_id as string));
}

export function revolvingBalance(debt: Debt, entries: DebtEntry[]): number {
  return round2(
    entries.reduce(
      (bal, e) => (e.kind === 'payment' ? bal - Number(e.amount) : bal + Number(e.amount)),
      Number(debt.principal),
    ),
  );
}

export function summarizeDebt(
  debt: Debt,
  installments: DebtInstallment[],
  entries: DebtEntry[],
  today: string,
): DebtSummary {
  const monthEnd = endOfMonth(today);

  if (debt.kind === 'revolving') {
    const balance = Math.max(0, revolvingBalance(debt, entries));
    const rate = monthlyRate(debt.interest_mode, debt.interest_rate);
    const minimum = debt.min_payment_percent != null ? round2((balance * Number(debt.min_payment_percent)) / 100) : null;
    const dueDate =
      debt.due_day && balance > 0
        ? firstDueOnOrAfter(today, { interval_unit: 'month', interval_count: 1, due_day: debt.due_day, due_last_day: false })
        : null;
    const interestCharged = entries.filter((e) => e.kind === 'interest').reduce((s, e) => s + Number(e.amount), 0);
    return {
      outstanding: balance,
      remainingPrincipal: balance,
      remainingInterest: 0,
      totalInterest: round2(interestCharged),
      paidCount: 0,
      totalCount: 0,
      nextDue: dueDate ? { date: dueDate, amount: minimum ?? balance, installmentId: null } : null,
      dueThisMonth: dueDate && dueDate <= monthEnd ? (minimum ?? balance) : 0,
      overdueCount: 0,
      estimatedMonthlyInterest: rate > 0 ? round2(balance * rate) : null,
      minimumPayment: minimum,
      utilization: debt.credit_limit ? balance / Number(debt.credit_limit) : null,
    };
  }

  const paid = paidInstallmentIds(entries);
  const sorted = [...installments].sort((a, b) => a.seq - b.seq);
  const unpaid = sorted.filter((i) => !paid.has(i.id));
  const sum = (rows: DebtInstallment[], f: (i: DebtInstallment) => number) => round2(rows.reduce((s, i) => s + f(i), 0));
  const first = unpaid[0];
  // Fees / extra interest / extra payments recorded outside the schedule.
  const extras = entries.filter((e) => !e.installment_id);
  const extraBalance = extras.reduce((s, e) => s + (e.kind === 'payment' ? -1 : 1) * Number(e.amount), 0);
  const extraInterest = extras.filter((e) => e.kind === 'interest').reduce((s, e) => s + Number(e.amount), 0);
  return {
    outstanding: Math.max(0, round2(sum(unpaid, (i) => Number(i.principal) + Number(i.interest)) + extraBalance)),
    remainingPrincipal: sum(unpaid, (i) => Number(i.principal)),
    remainingInterest: sum(unpaid, (i) => Number(i.interest)),
    totalInterest: round2(sum(sorted, (i) => Number(i.interest)) + extraInterest),
    paidCount: sorted.length - unpaid.length,
    totalCount: sorted.length,
    nextDue: first
      ? { date: first.due_date, amount: round2(Number(first.principal) + Number(first.interest)), installmentId: first.id }
      : null,
    dueThisMonth: sum(
      unpaid.filter((i) => i.due_date <= monthEnd),
      (i) => Number(i.principal) + Number(i.interest),
    ),
    overdueCount: unpaid.filter((i) => i.due_date < today).length,
    estimatedMonthlyInterest: null,
    minimumPayment: null,
    utilization: null,
  };
}

export interface DebtWithSummary {
  debt: Debt;
  summary: DebtSummary;
}

/** Summaries for every open (not closed) debt. */
export function summarizeAll(
  data: { debts: Debt[]; installments: DebtInstallment[]; entries: DebtEntry[] },
  today: string,
): DebtWithSummary[] {
  return data.debts
    .filter((d) => !d.closed_on)
    .map((debt) => ({
      debt,
      summary: summarizeDebt(
        debt,
        data.installments.filter((i) => i.debt_id === debt.id),
        data.entries.filter((e) => e.debt_id === debt.id),
        today,
      ),
    }));
}
