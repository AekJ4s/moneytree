import { check, supabase, unwrap } from '../../lib/supabase';
import type { IncomeSource } from './types';

export type IncomeSourceInput = Pick<IncomeSource, 'name' | 'kind' | 'icon' | 'note'>;

export async function listIncomeSources(includeInactive = false): Promise<IncomeSource[]> {
  let q = supabase.from('income_sources').select('*').order('created_at');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap(await q);
}

export async function createIncomeSource(input: IncomeSourceInput): Promise<IncomeSource> {
  return unwrap(await supabase.from('income_sources').insert({ ...input, name: input.name.trim() }).select().single());
}

export async function updateIncomeSource(id: string, patch: Partial<IncomeSourceInput & { active: boolean }>): Promise<void> {
  check(await supabase.from('income_sources').update(patch).eq('id', id));
}

export async function deleteIncomeSource(id: string): Promise<void> {
  check(await supabase.from('income_sources').delete().eq('id', id));
}

export interface IncomeRow {
  income_source_id: string | null;
  amount: number;
  txn_date: string;
}

/** Income transactions from `from` onwards (for per-source totals). */
export async function listIncomeSince(from: string): Promise<IncomeRow[]> {
  const rows = unwrap(
    await supabase.from('transactions').select('income_source_id, amount, txn_date').eq('type', 'income').gte('txn_date', from),
  ) as IncomeRow[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}
