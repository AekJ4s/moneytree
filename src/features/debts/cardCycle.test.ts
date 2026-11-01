import { describe, expect, it } from 'vitest';
import { dueDateForStatement, previousStatementDate, statementDateFor } from './cardCycle';

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
