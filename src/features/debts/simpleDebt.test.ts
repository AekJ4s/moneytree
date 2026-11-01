import { describe, expect, it } from 'vitest';
import { creditorStatus, debtTotals, dueDateThisMonth, minimumPayment } from './simpleDebt';
import type { Creditor, DebtPayment } from './types';

const lineBk: Creditor = {
  id: 'linebk',
  name: 'LINE BK',
  logo: null,
  sort_order: 1,
  balance: 77506.62,
  min_payment: null,
  min_payment_percent: 8,
  balance_updated_on: '2026-11-01',
  credit_limit: 162500,
  statement_day: 21,
  due_day: 20,
  created_at: '',
};

const pay = (amount: number, paid_on: string, creditor_id = 'linebk'): DebtPayment => ({
  id: paid_on + amount,
  creditor_id,
  amount,
  paid_on,
  note: null,
  created_at: '',
});

describe('minimumPayment', () => {
  it('uses the percentage of the balance', () => {
    expect(minimumPayment(lineBk)).toBe(6200.53);
  });
  it('a fixed amount wins over the percentage, capped at the balance', () => {
    expect(minimumPayment({ ...lineBk, min_payment: 3000 })).toBe(3000);
    expect(minimumPayment({ balance: 500, min_payment: 3000, min_payment_percent: null })).toBe(500);
  });
  it('nothing owed, nothing due', () => {
    expect(minimumPayment({ ...lineBk, balance: 0 })).toBe(0);
  });
});

describe('creditorStatus', () => {
  it('still to pay this month and available credit', () => {
    expect(creditorStatus(lineBk, [], '2026-11-02')).toMatchObject({
      minimum: 6200.53,
      paid: 0,
      remaining: 6200.53,
      dueDate: '2026-11-20',
      overdue: false,
      available: 84993.38,
    });
  });

  it('payments this month count; last month does not', () => {
    const s = creditorStatus(lineBk, [pay(5000, '2026-11-10'), pay(9000, '2026-10-20')], '2026-11-12');
    expect(s).toMatchObject({ paid: 5000, remaining: 1200.53 });
  });

  it('is overdue after the due day if the minimum is not paid', () => {
    expect(creditorStatus(lineBk, [], '2026-11-25').overdue).toBe(true);
    expect(creditorStatus(lineBk, [pay(6200.53, '2026-11-19')], '2026-11-25')).toMatchObject({ remaining: 0, overdue: false });
  });
});

describe('dueDateThisMonth', () => {
  it('clamps to short months', () => {
    expect(dueDateThisMonth(31, '2027-02-10')).toBe('2027-02-28');
    expect(dueDateThisMonth(null, '2027-02-10')).toBeNull();
  });
});

describe('debtTotals', () => {
  it('adds up all creditors', () => {
    const ktc: Creditor = { ...lineBk, id: 'ktc', balance: 1000, min_payment: 1000, min_payment_percent: null, credit_limit: null };
    const totals = debtTotals([creditorStatus(lineBk, [], '2026-11-02'), creditorStatus(ktc, [pay(1000, '2026-11-01', 'ktc')], '2026-11-02')]);
    expect(totals).toEqual({ owed: 78506.62, minimum: 7200.53, paid: 1000, remaining: 6200.53 });
  });
});
