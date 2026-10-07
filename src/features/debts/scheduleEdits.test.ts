import { describe, expect, it } from 'vitest';
import { buildSchedule } from './debtMath';
import { planInstallmentEdit } from './scheduleEdits';
import type { Debt, DebtInstallment } from './types';

const debt: Debt = {
  id: 'd',
  creditor_id: 'c',
  name: 'ผ่อน 24 งวด',
  kind: 'installment',
  principal: 10000,
  interest_mode: 'annual',
  interest_rate: 23,
  interest_method: 'reducing',
  term_months: 24,
  start_date: '2026-09-10',
  first_due_date: '2026-10-20',
  due_day: 20,
  credit_limit: null,
  min_payment_percent: null,
  installment_amount: 523.73,
  borrower: null,
  closed_on: null,
  note: null,
  created_at: '',
};

function schedule(d: Debt): DebtInstallment[] {
  return buildSchedule({
    principal: d.principal,
    termMonths: d.term_months!,
    interestMode: d.interest_mode,
    interestRate: d.interest_rate,
    interestMethod: d.interest_method,
    firstDueDate: d.first_due_date!,
    fixedPayment: d.installment_amount,
  }).map((r) => ({ ...r, id: `i${r.seq}`, debt_id: d.id, confirmed: false }));
}

function apply(rows: DebtInstallment[], changes: ReturnType<typeof planInstallmentEdit>): DebtInstallment[] {
  return rows.map((r) => ({ ...r, ...(changes.find((c) => c.id === r.id)?.patch ?? {}) }));
}

describe('planInstallmentEdit (fixed payment)', () => {
  it('entering the statement interest gives the statement principal and re-estimates later rows', () => {
    const rows = schedule(debt);
    const changes = planInstallmentEdit(debt, rows, new Set(), 'i1', { kind: 'interest', value: 126.03 });
    const next = apply(rows, changes);
    expect(next[0]).toMatchObject({ principal: 397.7, interest: 126.03, confirmed: true });
    expect(next[1]).toMatchObject({ principal: 339.69, interest: 184.04, confirmed: false });
    expect(next.reduce((s, r) => s + Number(r.principal), 0)).toBeCloseTo(10000, 2);
  });

  it('a principal override keeps the interest and shifts later rows', () => {
    const rows = schedule(debt);
    const next = apply(rows, planInstallmentEdit(debt, rows, new Set(), 'i1', { kind: 'principal', value: 400 }));
    expect(next[0]).toMatchObject({ principal: 400, interest: 191.67, confirmed: true });
    expect(next.reduce((s, r) => s + Number(r.principal), 0)).toBeCloseTo(10000, 2);
  });

  it('reset returns a row to the estimate', () => {
    const rows = schedule(debt);
    const edited = apply(rows, planInstallmentEdit(debt, rows, new Set(), 'i1', { kind: 'interest', value: 126.03 }));
    const reset = apply(edited, planInstallmentEdit(debt, edited, new Set(), 'i1', { kind: 'reset' }));
    expect(reset[0]).toMatchObject({ principal: 332.06, interest: 191.67, confirmed: false });
  });

  it('paid rows are never recalculated', () => {
    const rows = schedule(debt);
    const changes = planInstallmentEdit(debt, rows, new Set(['i1']), 'i2', { kind: 'interest', value: 150 });
    expect(changes.find((c) => c.id === 'i1')).toBeUndefined();
  });
});

describe('planInstallmentEdit (normal schedule)', () => {
  it('only changes the edited field', () => {
    const plain = { ...debt, installment_amount: null };
    const rows = schedule(plain);
    expect(planInstallmentEdit(plain, rows, new Set(), 'i3', { kind: 'principal', value: 500 })).toEqual([
      { id: 'i3', patch: { principal: 500, confirmed: true } },
    ]);
  });
});
