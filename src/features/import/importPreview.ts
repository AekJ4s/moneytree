import type { ExistingSummary, ImportTransaction } from './api';
import type { ParsedRow, RowStatus } from './sheetRows';

export interface PreviewRow extends ParsedRow {
  key: string;
  status: RowStatus;
  selected: boolean;
}

function dupKey(date: string, type: string, amount: number): string {
  return `${date}|${type}|${amount.toFixed(2)}`;
}

/**
 * Classifies each parsed row:
 * - invalid / transfer rows are never imported (the template excludes transfers from totals);
 * - rows whose key is already stored were imported before;
 * - rows matching an existing slip/manual entry (same date, type, amount) are flagged as possible
 *   duplicates and left unselected. Each existing entry can only explain one sheet row.
 */
export function classifyRows(
  rows: (ParsedRow & { key: string })[],
  importedKeys: Set<string>,
  existing: ExistingSummary[],
): PreviewRow[] {
  const available = new Map<string, number>();
  for (const e of existing) {
    const k = dupKey(e.txn_date, e.type, Number(e.amount));
    available.set(k, (available.get(k) ?? 0) + 1);
  }

  return rows.map((row) => {
    let status: RowStatus;
    if (row.errors.length > 0) status = 'invalid';
    else if (row.type === 'transfer') status = 'transfer';
    else if (importedKeys.has(row.key)) status = 'imported';
    else {
      const k = dupKey(row.date!, row.type!, row.amount!);
      const left = available.get(k) ?? 0;
      if (left > 0) {
        available.set(k, left - 1);
        status = 'possible-duplicate';
      } else {
        status = 'new';
      }
    }
    return { ...row, status, selected: status === 'new' };
  });
}

export function toImportTransaction(row: PreviewRow): ImportTransaction {
  if (row.type !== 'income' && row.type !== 'expense') throw new Error(`row ${row.rowNumber} is not importable`);
  return {
    type: row.type,
    amount: row.amount!,
    txn_date: row.date!,
    category: row.category,
    note: [row.detail, row.note].filter(Boolean).join(' · ') || null,
    account: row.account,
    import_key: row.key,
  };
}
