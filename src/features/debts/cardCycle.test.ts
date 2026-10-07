import { describe, expect, it } from 'vitest';
import { cardCycle, dueDateForStatement, previousStatementDate, statementDateFor } from './cardCycle';
import type { Debt, DebtEntry } from './types';

describe('statement dates', () => {
  it('a charge on the 24th lands on this month\'s statement when the card cuts off on the 30th', () => {
    expect(statementDateFor('2026-10-24', 30)).toBe('2026-10-30');
  });
  it('a charge after the cut-off goes to next month', () => {
    expect(statementDateFor('2026-10-24', 20)).toBe('2026-11-20');
  });
  it('the cut-off day itself belongs to that statement', () => {
    expect(statementDateFor('2026-10-20', 20)).toBe('2026-10-20');
  });
  it('short months use their last day', () => {
    expect(statementDateFor('2027-02-10', 30)).toBe('2027-02-28');
  });
  it('due date is the first due day after the cut-off', () => {
    expect(dueDateForStatement('2026-10-30', 20)).toBe('2026-11-20');
    expect(dueDateForStatement('2026-10-05', 25)).toBe('2026-10-25');
  });
  it('previous cut-off', () => {
    expect(previousStatementDate('2026-10-07', 30)).toBe('2026-09-30');
    expect(previousStatementDate('2026-10-30', 30)).toBe('2026-10-30');
    expect(previousStatementDate('2026-03-10', 30)).toBe('2026-02-28');
  });
});

const card: Debt = {
  id: 'card',
  creditor_id: 'c',
  name: 'บัตรหลัก',
  kind: 'revolving',
  principal: 0,
  interest_mode: 'annual',
  interest_rate: 16,
  interest_method: 'flat',
  term_months: null,
  start_date: '2026-09-01',
  first_due_date: null,
  due_day: 20,
  credit_limit: 50000,
  min_payment_percent: 8,
  installment_amount: null,
  borrower: null,
  statement_day: 30,
  closed_on: null,
  note: null,
  created_at: '',
};

function e(kind: DebtEntry['kind'], amount: number, entry_date: string): DebtEntry {
  return { id: `${kind}${entry_date}`, debt_id: 'card', installment_id: null, kind, amount, entry_date, note: null, transaction_id: null, created_at: '' };
}

describe('cardCycle', () => {
  it('splits billed and unbilled spending (Claude on the 24th, cut-off 30th, due 20th)', () => {
    const entries = [e('charge', 720, '2026-09-24'), e('charge', 720, '2026-10-24'), e('charge', 300, '2026-11-02')];
    // On 5 Nov nothing has been paid: both Claude charges are on the 30/10 statement (due 20/11),
    // while the 2 Nov charge waits for the 30/11 statement.
    expect(cardCycle(card, entries, '2026-11-05')).toEqual({
      lastStatement: '2026-10-30',
      billed: 1440,
      billedDue: '2026-11-20',
      nextStatement: '2026-11-30',
      unbilled: 300,
      unbilledDue: '2026-12-20',
    });
  });

  it('payments after the cut-off reduce the billed amount first', () => {
    const entries = [e('charge', 720, '2026-10-24'), e('payment', 720, '2026-11-15'), e('charge', 720, '2026-11-24')];
    expect(cardCycle(card, entries, '2026-11-26')).toMatchObject({ billed: 0, billedDue: null, unbilled: 720, unbilledDue: '2026-12-20' });
  });

  it('returns null without a statement day', () => {
    expect(cardCycle({ ...card, statement_day: null }, [], '2026-11-05')).toBeNull();
  });
});
