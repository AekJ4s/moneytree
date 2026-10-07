import { firstDueOnOrAfter, nextDueDate } from '../../lib/recurrence';
import { cardCycle, type CardCycle } from './cardCycle';
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
  /** Principal still owed — the figure banking apps show. */
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
  /** Cards with a statement day: billed vs not-yet-billed balance. */
  cycle: CardCycle | null;
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
    const minPct = debt.min_payment_percent != null ? Number(debt.min_payment_percent) : null;
    const toPay = (amount: number) => (minPct != null ? round2((amount * minPct) / 100) : amount);
    const cycle = cardCycle(debt, entries, today);

    // With a statement day, what is due is the last statement (or, if that is settled, the next one).
    const statementAmount = cycle ? (cycle.billed > 0 ? cycle.billed : cycle.unbilled) : balance;
    const minimum = minPct != null ? toPay(statementAmount) : null;
    const dueDate = cycle
      ? (cycle.billedDue ?? cycle.unbilledDue)
      : debt.due_day && balance > 0
        ? firstDueOnOrAfter(today, { interval_unit: 'month', interval_count: 1, due_day: debt.due_day, due_last_day: false })
        : null;
    const dueThisMonth = cycle
      ? (cycle.billedDue && cycle.billedDue <= monthEnd ? toPay(cycle.billed) : 0) +
        (cycle.unbilledDue && cycle.unbilledDue <= monthEnd ? toPay(cycle.unbilled) : 0)
      : dueDate && dueDate <= monthEnd
        ? toPay(balance)
        : 0;
    const interestCharged = entries.filter((e) => e.kind === 'interest').reduce((s, e) => s + Number(e.amount), 0);
    return {
      outstanding: balance,
      // Banks show the principal only; billed-but-unpaid interest is part of the statement amount.
      remainingPrincipal: Math.max(0, round2(balance - unpaidInterest(entries))),
      remainingInterest: 0,
      totalInterest: round2(interestCharged),
      paidCount: 0,
      totalCount: 0,
      nextDue: dueDate ? { date: dueDate, amount: minimum ?? statementAmount, installmentId: null } : null,
      dueThisMonth: round2(dueThisMonth),
      overdueCount: cycle?.billedDue && cycle.billedDue < today ? 1 : 0,
      estimatedMonthlyInterest: rate > 0 ? round2(balance * rate) : null,
      minimumPayment: minimum,
      utilization: debt.credit_limit ? balance / Number(debt.credit_limit) : null,
      cycle,
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
    cycle: null,
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

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000));
}

/** Simple daily interest, as banks charge on revolving credit: balance × rate × days / 365. */
export function interestByDays(balance: number, annualPercent: number, fromIso: string, toIso: string): number {
  return round2((Math.max(0, balance) * (annualPercent / 100) * daysBetween(fromIso, toIso)) / 365);
}

export interface InterestSplitTarget {
  id: string;
  balance: number;
  /** null = the owner's own portion. */
  borrower: string | null;
  annualPercent: number;
  /** Interest accrues from here (start date, or the date of the last interest entry). */
  accruesFrom: string;
}

/** Splits `total` proportionally to the weights; the last share absorbs rounding. */
function proportional(total: number, ids: string[], weights: number[]): Record<string, number> {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const out: Record<string, number> = {};
  let given = 0;
  ids.forEach((id, i) => {
    const share = i === ids.length - 1 ? round2(total - given) : sum > 0 ? round2((total * Math.max(0, weights[i])) / sum) : 0;
    out[id] = share;
    given = round2(given + share);
  });
  return out;
}

/**
 * Splits one statement's interest between portions of a shared credit line.
 * - 'balance': proportional to current balances.
 * - 'days': other people's portions are charged daily interest since they accrued
 *   (e.g. Mom's 60,000 drawn on the 19th), and the owner's portion takes the remainder.
 */
export function splitInterest(
  total: number,
  targets: InterestSplitTarget[],
  method: 'balance' | 'days',
  statementDate: string,
): Record<string, number> {
  // Interest-free portions (0%) never take a share, unless nothing else bears interest.
  const bearing = targets.filter((t) => t.annualPercent > 0);
  const pool = bearing.length > 0 ? bearing : targets;
  const zeros = Object.fromEntries(targets.filter((t) => !pool.includes(t)).map((t) => [t.id, 0]));
  if (pool.length === 0) return {};
  if (method === 'balance') return { ...zeros, ...proportional(total, pool.map((t) => t.id), pool.map((t) => t.balance)) };

  const others = pool.filter((t) => t.borrower);
  const own = pool.filter((t) => !t.borrower);
  // With no owner portion, the last other portion takes the remainder instead.
  const charged = own.length > 0 ? others : others.slice(0, -1);
  const remainderTargets = own.length > 0 ? own : others.slice(-1);

  const out: Record<string, number> = {};
  let used = 0;
  for (const t of charged) {
    const share = Math.min(round2(total - used), interestByDays(t.balance, t.annualPercent, t.accruesFrom, statementDate));
    out[t.id] = Math.max(0, share);
    used = round2(used + out[t.id]);
  }
  return {
    ...zeros,
    ...out,
    ...proportional(round2(total - used), remainderTargets.map((t) => t.id), remainderTargets.map((t) => t.balance)),
  };
}

/** Principal still owed, split into my own debt and amounts used by other people (by name). */
export function outstandingByBorrower(open: DebtWithSummary[]): { mine: number; others: { name: string; amount: number }[] } {
  let mine = 0;
  const others = new Map<string, number>();
  for (const { debt, summary } of open) {
    if (debt.borrower) others.set(debt.borrower, (others.get(debt.borrower) ?? 0) + summary.remainingPrincipal);
    else mine += summary.remainingPrincipal;
  }
  return {
    mine: round2(mine),
    others: Array.from(others, ([name, amount]) => ({ name, amount: round2(amount) })),
  };
}

/** Interest posted since the last payment (what the next full payment includes as interest). */
export function unpaidInterest(entries: DebtEntry[]): number {
  const order = (e: DebtEntry) => `${e.entry_date}|${e.created_at}`;
  const sorted = [...entries].sort((a, b) => order(a).localeCompare(order(b)));
  let interest = 0;
  for (const e of sorted) {
    if (e.kind === 'payment') interest = 0;
    else if (e.kind === 'interest') interest += Number(e.amount);
  }
  return round2(interest);
}

export interface CreditLine {
  limit: number;
  /** Principal still owed on every open debt with this creditor (cards, cash lines and installments). */
  used: number;
  available: number;
  usedRatio: number;
}

/** Remaining credit (วงเงินคงเหลือ) of a creditor, or null when no credit limit is set. */
export function creditLine(creditLimit: number | null, creditorId: string, open: DebtWithSummary[]): CreditLine | null {
  if (creditLimit == null) return null;
  const limit = Number(creditLimit);
  const used = round2(
    open.filter((d) => d.debt.creditor_id === creditorId).reduce((s, d) => s + d.summary.remainingPrincipal, 0),
  );
  return { limit, used, available: round2(limit - used), usedRatio: limit > 0 ? used / limit : 0 };
}
