import { describe, expect, it } from 'vitest';
import { isSavings, sumMoney } from './savings';

describe('savings', () => {
  it('recognises savings by category or by a linked asset', () => {
    expect(isSavings({ category: 'ลงทุน' })).toBe(true);
    expect(isSavings({ category: ' เก็บออม ' })).toBe(true);
    expect(isSavings({ category: 'อาหาร', asset_id: 'dime' })).toBe(true);
    expect(isSavings({ category: 'อาหาร' })).toBe(false);
  });

  it('keeps savings out of income/expense totals', () => {
    expect(
      sumMoney([
        { type: 'income', amount: 28125, category: 'เงินเดือน' },
        { type: 'expense', amount: 60, category: 'อาหาร' },
        { type: 'expense', amount: 1000, category: 'ลงทุน' },
        { type: 'income', amount: 200, category: 'ลงทุน' },
      ]),
    ).toEqual({ income: 28125, expense: 60, savings: 800 });
  });
});
