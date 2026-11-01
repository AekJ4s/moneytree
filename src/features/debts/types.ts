/**
 * Debts are kept rough on purpose: each creditor has a total owed and a minimum payment,
 * updated by hand from the bank app. Payments reduce the total and leave the account.
 */
export interface Creditor {
  id: string;
  name: string;
  logo: string | null;
  sort_order: number;
  /** Total owed right now (หนี้รวม). */
  balance: number;
  /** Minimum payment in baht; when empty, `min_payment_percent` of the balance is used. */
  min_payment: number | null;
  min_payment_percent: number | null;
  /** When the balance was last set from the bank. */
  balance_updated_on: string | null;
  /** Optional credit line, to show what is still available. */
  credit_limit: number | null;
  /** Card statement cut-off day, used to hint which bill a card expense lands on. */
  statement_day: number | null;
  due_day: number | null;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  creditor_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
}
