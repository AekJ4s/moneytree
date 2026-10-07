import { addDays, todayIso } from '../../lib/format';
import { supabase, unwrap } from '../../lib/supabase';
import type { RecentTxn } from './quickTemplates';

/** Recent transactions used to learn quick-add buttons and autofill (last 120 days). */
export async function listRecentForQuick(days = 120): Promise<RecentTxn[]> {
  const rows = unwrap(
    await supabase
      .from('transactions')
      .select(
        'id, type, amount, txn_date, created_at, category, note, payee_id, payee:payees(name), payment_method, creditor_id, account, asset_id, income_source_id, source',
      )
      .gte('txn_date', addDays(todayIso(), -days))
      .order('txn_date', { ascending: false })
      .limit(1000),
  ) as unknown as RecentTxn[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}
