import { check, supabase, unwrap } from '../../lib/supabase';

export interface BalanceOverview {
  configured: boolean;
  opening_balance: number;
  opening_date: string | null;
  /** Real account balance: opening balance + every cash movement after the opening date. */
  cash_balance: number;
  receivables: { person: string; amount: number }[];
}

export async function getBalanceOverview(): Promise<BalanceOverview> {
  const data = unwrap(await supabase.rpc('balance_overview')) as BalanceOverview;
  return {
    ...data,
    opening_balance: Number(data.opening_balance),
    cash_balance: Number(data.cash_balance),
    receivables: data.receivables.map((r) => ({ person: r.person, amount: Number(r.amount) })),
  };
}

/** Sets the account balance as it was at the end of `date`. */
export async function saveOpeningBalance(amount: number, date: string): Promise<void> {
  check(
    await supabase
      .from('user_settings')
      .upsert({ opening_balance: amount, opening_date: date, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
  );
}

export type ReceivableKind = 'lend' | 'collect' | 'charge';

export interface ReceivableEntry {
  id: string;
  person: string;
  kind: ReceivableKind;
  amount: number;
  entry_date: string;
  note: string | null;
  debt_id: string | null;
  created_at: string;
}

export const RECEIVABLE_LABEL: Record<ReceivableKind, string> = {
  lend: 'ให้ยืม',
  collect: 'รับคืน',
  charge: 'เพิ่มยอดค้าง',
};

export async function listReceivableEntries(range?: { from: string; to: string }): Promise<ReceivableEntry[]> {
  let q = supabase.from('receivable_entries').select('*').order('entry_date', { ascending: false });
  if (range) q = q.gte('entry_date', range.from).lte('entry_date', range.to);
  return unwrap(await q);
}

export async function addReceivableEntry(e: {
  person: string;
  kind: ReceivableKind;
  amount: number;
  date: string;
  note: string | null;
}): Promise<void> {
  check(
    await supabase
      .from('receivable_entries')
      .insert({ person: e.person.trim(), kind: e.kind, amount: e.amount, entry_date: e.date, note: e.note }),
  );
}

export async function deleteReceivableEntry(id: string): Promise<void> {
  check(await supabase.from('receivable_entries').delete().eq('id', id));
}

/** Outstanding amount per person (lend + charge − collect). */
export function receivableBalances(entries: ReceivableEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const sign = e.kind === 'collect' ? -1 : 1;
    out.set(e.person, Math.round(((out.get(e.person) ?? 0) + sign * Number(e.amount)) * 100) / 100);
  }
  return out;
}

export interface CashMovement {
  id: string;
  date: string;
  label: string;
  /** Signed effect on the account: + money in, − money out. */
  amount: number;
  source: 'debt' | 'receivable';
}

/** Account movements that are not income/expense transactions: debt payments, credit draws, lending. */
export async function listCashMovements(from: string, to: string): Promise<CashMovement[]> {
  const [debtRes, recv] = await Promise.all([
    supabase
      .from('debt_entries')
      .select('id, kind, amount, entry_date, note, transaction_id, debt:debts(name, borrower, creditor:creditors(name))')
      .in('kind', ['payment', 'charge'])
      .gte('entry_date', from)
      .lte('entry_date', to),
    listReceivableEntries({ from, to }),
  ]);
  type DebtRow = {
    id: string;
    kind: 'payment' | 'charge';
    amount: number;
    entry_date: string;
    note: string | null;
    transaction_id: string | null;
    debt: { name: string; borrower: string | null; creditor: { name: string } | null } | null;
  };
  const debtRows = (unwrap(debtRes) as unknown as DebtRow[]).filter((d) => d.kind === 'payment' || !d.transaction_id);
  return [
    ...debtRows.map((d) => ({
      id: d.id,
      date: d.entry_date,
      label: `${d.kind === 'payment' ? 'ชำระ' : 'เบิกวงเงิน'} ${d.debt?.creditor?.name ?? ''} · ${d.debt?.name ?? ''}${d.note ? ` (${d.note})` : ''}`,
      amount: (d.kind === 'payment' ? -1 : 1) * Number(d.amount),
      source: 'debt' as const,
    })),
    ...recv
      .filter((r) => r.kind !== 'charge')
      .map((r) => ({
        id: r.id,
        date: r.entry_date,
        label: `${RECEIVABLE_LABEL[r.kind]} ${r.person}${r.note ? ` (${r.note})` : ''}`,
        amount: (r.kind === 'lend' ? -1 : 1) * Number(r.amount),
        source: 'receivable' as const,
      })),
  ];
}
