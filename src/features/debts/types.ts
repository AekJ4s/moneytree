export type DebtKind = 'revolving' | 'installment' | 'paylater';
export type InterestMode = 'none' | 'annual' | 'monthly' | 'manual';
export type InterestMethod = 'flat' | 'reducing';
export type DebtEntryKind = 'payment' | 'charge' | 'interest' | 'fee';

export interface Creditor {
  id: string;
  name: string;
  logo: string | null;
  sort_order: number;
  created_at: string;
}

export interface Debt {
  id: string;
  creditor_id: string;
  name: string;
  kind: DebtKind;
  principal: number;
  interest_mode: InterestMode;
  interest_rate: number | null;
  interest_method: InterestMethod;
  term_months: number | null;
  start_date: string;
  first_due_date: string | null;
  due_day: number | null;
  credit_limit: number | null;
  min_payment_percent: number | null;
  /** Fixed payment per installment (bank-style); principal = payment - interest. */
  installment_amount: number | null;
  /** Who actually uses this money (null = me), e.g. "แม่". */
  borrower: string | null;
  closed_on: string | null;
  note: string | null;
  created_at: string;
}

export type DebtInput = Omit<Debt, 'id' | 'created_at'>;

export interface DebtInstallment {
  id: string;
  debt_id: string;
  seq: number;
  due_date: string;
  principal: number;
  interest: number;
  /** Values come from a statement (not estimated). */
  confirmed: boolean;
}

export interface DebtEntry {
  id: string;
  debt_id: string;
  installment_id: string | null;
  kind: DebtEntryKind;
  amount: number;
  entry_date: string;
  note: string | null;
  transaction_id: string | null;
  created_at: string;
}

export const KIND_LABEL: Record<DebtKind, string> = {
  revolving: 'เงินหมุน / บัตรเครดิต',
  installment: 'ผ่อนชำระ',
  paylater: 'PayLater',
};

export const ENTRY_LABEL: Record<DebtEntryKind, string> = {
  payment: 'ชำระ',
  charge: 'ใช้จ่ายเพิ่ม',
  interest: 'ดอกเบี้ย',
  fee: 'ค่าธรรมเนียม',
};
