import { supabase, check, unwrap, unwrapMaybe } from '../../lib/supabase';
import type { Payee, PayeeRule, RuleMatchType, TxnType } from '../../lib/types';

export async function listPayees(): Promise<Payee[]> {
  return unwrap(await supabase.from('payees').select('*').order('name'));
}

export async function listRules(): Promise<PayeeRule[]> {
  return unwrap(await supabase.from('payee_rules').select('*').order('created_at'));
}

/** Returns the payee with this name, creating it if it doesn't exist yet. */
export async function ensurePayee(name: string, defaultType: TxnType, category: string | null): Promise<Payee> {
  const trimmed = name.trim();
  const existing = unwrapMaybe(await supabase.from('payees').select('*').eq('name', trimmed).maybeSingle());
  if (existing) return existing;
  return unwrap(
    await supabase
      .from('payees')
      .insert({ name: trimmed, default_type: defaultType, category: category || null })
      .select()
      .single(),
  );
}

export async function updatePayee(id: string, patch: Partial<Pick<Payee, 'name' | 'default_type' | 'category'>>): Promise<void> {
  check(await supabase.from('payees').update(patch).eq('id', id));
}

export async function deletePayee(id: string): Promise<void> {
  check(await supabase.from('payees').delete().eq('id', id));
}

/** Creates a mapping rule; if the same key already maps somewhere, it is repointed to this payee. */
export async function upsertRule(payeeId: string, matchType: RuleMatchType, matchValue: string): Promise<void> {
  check(
    await supabase
      .from('payee_rules')
      .upsert(
        { payee_id: payeeId, match_type: matchType, match_value: matchValue },
        { onConflict: 'user_id,match_type,match_value' },
      ),
  );
}

export async function deleteRule(id: string): Promise<void> {
  check(await supabase.from('payee_rules').delete().eq('id', id));
}
