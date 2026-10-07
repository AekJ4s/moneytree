/**
 * Savings & investment money is moved, not spent: a "ลงทุน" / "เก็บออม" expense is a deposit into an
 * asset and an income in those categories is a withdrawal. They are kept out of income/expense totals.
 */
export const SAVINGS_CATEGORIES = ['ลงทุน', 'เก็บออม'] as const;

export function isSavingsCategory(category: string | null | undefined): boolean {
  return !!category && (SAVINGS_CATEGORIES as readonly string[]).includes(category.trim());
}

export function isSavings(t: { category: string | null; asset_id?: string | null }): boolean {
  return !!t.asset_id || isSavingsCategory(t.category);
}

export interface MoneyTotals {
  income: number;
  expense: number;
  /** Net amount put into savings/investments (deposits − withdrawals). */
  savings: number;
}

export function sumMoney(transactions: { type: 'income' | 'expense'; amount: number; category: string | null; asset_id?: string | null }[]): MoneyTotals {
  const totals = { income: 0, expense: 0, savings: 0 };
  for (const t of transactions) {
    const amount = Number(t.amount);
    if (isSavings(t)) totals.savings += t.type === 'expense' ? amount : -amount;
    else totals[t.type] += amount;
  }
  return {
    income: Math.round(totals.income * 100) / 100,
    expense: Math.round(totals.expense * 100) / 100,
    savings: Math.round(totals.savings * 100) / 100,
  };
}
