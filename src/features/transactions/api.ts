import { supabase, check, unwrap } from '../../lib/supabase';
import type { NewTransaction, Transaction } from '../../lib/types';

const SELECT_WITH_PAYEE = '*, payee:payees(id, name)';

export async function listTransactions(from: string, to: string): Promise<Transaction[]> {
  return unwrap(
    await supabase
      .from('transactions')
      .select(SELECT_WITH_PAYEE)
      .gte('txn_date', from)
      .lte('txn_date', to)
      .order('txn_date', { ascending: false })
      .order('txn_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  );
}

export async function createTransaction(txn: Partial<NewTransaction> & Pick<NewTransaction, 'type' | 'amount' | 'txn_date'>): Promise<Transaction> {
  return unwrap(await supabase.from('transactions').insert(txn).select(SELECT_WITH_PAYEE).single());
}

export async function updateTransaction(id: string, patch: Partial<NewTransaction>): Promise<void> {
  check(await supabase.from('transactions').update(patch).eq('id', id));
}

export async function deleteTransaction(id: string): Promise<void> {
  check(await supabase.from('transactions').delete().eq('id', id));
}

/** Returns which of the given slip references are already saved. */
export async function findExistingSlipRefs(refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const rows = unwrap(await supabase.from('transactions').select('slip_ref').in('slip_ref', refs));
  return new Set(rows.map((r: { slip_ref: string | null }) => r.slip_ref).filter((r): r is string => !!r));
}

export async function listCategories(): Promise<string[]> {
  const rows = unwrap(await supabase.from('transactions').select('category').not('category', 'is', null).limit(1000));
  return Array.from(new Set(rows.map((r: { category: string | null }) => r.category as string))).sort();
}
