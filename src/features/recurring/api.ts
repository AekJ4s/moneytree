import { supabase, check, unwrap } from '../../lib/supabase';
import type { RecurringItem, Transaction } from '../../lib/types';

export type RecurringInput = Omit<RecurringItem, 'id' | 'created_at'>;

export async function listRecurring(): Promise<RecurringItem[]> {
  return unwrap(await supabase.from('recurring_items').select('*').order('next_due_date'));
}

export async function listDueRecurring(onOrBefore: string): Promise<RecurringItem[]> {
  return unwrap(
    await supabase
      .from('recurring_items')
      .select('*')
      .eq('active', true)
      .lte('next_due_date', onOrBefore)
      .order('next_due_date'),
  );
}

export async function createRecurring(input: RecurringInput): Promise<void> {
  check(await supabase.from('recurring_items').insert(input));
}

export async function updateRecurring(id: string, patch: Partial<RecurringInput>): Promise<void> {
  check(await supabase.from('recurring_items').update(patch).eq('id', id));
}

export async function deleteRecurring(id: string): Promise<void> {
  check(await supabase.from('recurring_items').delete().eq('id', id));
}

/** Records the due occurrence as a transaction and advances the next due date (atomic RPC). */
export async function recordRecurring(id: string, amount: number, date: string): Promise<Transaction> {
  return unwrap(await supabase.rpc('record_recurring', { p_item_id: id, p_amount: amount, p_date: date }));
}

export async function skipRecurring(id: string): Promise<void> {
  check(await supabase.rpc('skip_recurring', { p_item_id: id }));
}
