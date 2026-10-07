export type TxnType = 'income' | 'expense';
export type TxnSource = 'manual' | 'slip' | 'recurring' | 'import';
export type RuleMatchType = 'promptpay' | 'keyword';
export type IntervalUnit = 'week' | 'month' | 'year';

export interface Payee {
  id: string;
  name: string;
  default_type: TxnType;
  category: string | null;
  created_at: string;
}

export interface PayeeRule {
  id: string;
  payee_id: string;
  match_type: RuleMatchType;
  match_value: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: TxnType;
  amount: number;
  txn_date: string;
  txn_time: string | null;
  payee_id: string | null;
  category: string | null;
  note: string | null;
  source: TxnSource;
  recurring_id: string | null;
  slip_ref: string | null;
  slip_bank: string | null;
  slip_image_path: string | null;
  qr_payload: string | null;
  account: string | null;
  import_key: string | null;
  created_at: string;
  payee?: Pick<Payee, 'id' | 'name'> | null;
}

export type NewTransaction = Omit<Transaction, 'id' | 'created_at' | 'payee'>;

export interface RecurringItem {
  id: string;
  name: string;
  type: TxnType;
  amount: number;
  category: string | null;
  payee_id: string | null;
  interval_unit: IntervalUnit;
  interval_count: number;
  next_due_date: string;
  active: boolean;
  note: string | null;
  created_at: string;
}
