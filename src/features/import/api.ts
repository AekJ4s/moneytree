import { check, supabase, unwrap } from '../../lib/supabase';
import type { NewTransaction, TxnType } from '../../lib/types';

const KEY_CHUNK = 100; // keeps the `in (...)` filter well under URL length limits
const INSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Which import keys were already imported. */
export async function findImportedKeys(keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(keys, KEY_CHUNK)) {
    const rows = unwrap(await supabase.from('transactions').select('import_key').in('import_key', part));
    for (const r of rows as { import_key: string | null }[]) if (r.import_key) found.add(r.import_key);
  }
  return found;
}

export interface ExistingSummary {
  txn_date: string;
  type: TxnType;
  amount: number;
}

/** Non-imported transactions (slips, manual, recurring) in a date range, for spotting likely duplicates. */
export async function listNonImportedInRange(from: string, to: string): Promise<ExistingSummary[]> {
  return unwrap(
    await supabase
      .from('transactions')
      .select('txn_date, type, amount')
      .gte('txn_date', from)
      .lte('txn_date', to)
      .neq('source', 'import'),
  );
}

export type ImportTransaction = Pick<
  NewTransaction,
  'type' | 'amount' | 'txn_date' | 'category' | 'note' | 'account' | 'import_key'
>;

/**
 * Inserts imported rows. Rows whose import_key already exists are skipped by the database
 * (unique constraint + ignoreDuplicates), so a double click or a re-upload can't duplicate data.
 */
export async function insertImported(rows: ImportTransaction[]): Promise<void> {
  for (const part of chunk(rows, INSERT_CHUNK)) {
    check(
      await supabase
        .from('transactions')
        .upsert(
          part.map((r) => ({ ...r, source: 'import' as const })),
          { onConflict: 'user_id,import_key', ignoreDuplicates: true },
        ),
    );
  }
}
