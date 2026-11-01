import { describe, expect, it } from 'vitest';
import type { Creditor, DebtPayment } from '../debts/types';
import { buildPayables, projectedBalance } from './payables';

const creditor = (id: string, balance: number, min: number, due_day: number): Creditor => ({
  id,
  name: id,
  logo: null,
  sort_order: 0,
  balance,
  min_payment: min,
  min_payment_percent: null,
  balance_updated_on: null,
  credit_limit: null,
  statement_day: null,
  due_day,
  created_at: '',
});

const payment = (creditor_id: string, amount: number, paid_on: string): DebtPayment => ({
  id: creditor_id + paid_on,
  creditor_id,
  amount,
  paid_on,
  note: null,
  created_at: '',
});

describe('buildPayables', () => {
  const creditors = [creditor('linebk', 77506.62, 6200.53, 20), creditor('ktc', 1500, 1500, 5), creditor('paid-off', 0, 500, 1)];

  it('counts unpaid minimum payments this month, soonest first', () => {
    const p = buildPayables(creditors, [], '2026-11-02');
    expect(p.remaining).toBe(7700.53);
    expect(p.owed).toBe(79006.62);
    expect(p.due.map((s) => s.creditor.id)).toEqual(['ktc', 'linebk']);
  });

  it('a creditor paid this month drops out', () => {
    const p = buildPayables(creditors, [payment('ktc', 1500, '2026-11-01')], '2026-11-02');
    expect(p.remaining).toBe(6200.53);
    expect(p.due.map((s) => s.creditor.id)).toEqual(['linebk']);
  });
});

describe('projectedBalance', () => {
  it('adds what comes in and subtracts what has to be paid this month', () => {
    expect(projectedBalance(15000, 61399.53, 71399.53)).toBe(5000);
  });
});
