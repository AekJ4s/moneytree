/**
 * Builds a CSV of transactions in the same columns as the import template, so an exported file
 * can be opened in Excel / Google Sheets and imported back.
 */
import { isSavings } from '../../lib/savings';
import type { Transaction } from '../../lib/types';

export const EXPORT_HEADER = ['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน', 'บัญชี/ช่องทาง', 'หมายเหตุ', 'เวลา'];

export type ExportTransaction = Pick<
  Transaction,
  'type' | 'amount' | 'txn_date' | 'txn_time' | 'category' | 'note' | 'account' | 'payment_method' | 'asset_id' | 'created_at'
> & { payee?: { name: string } | null };

/** Quotes a field when needed and defuses leading characters that spreadsheets run as formulas. */
export function csvField(value: string): string {
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** YYYY-MM-DD to dd/mm/yyyy (CE), the date format the importer reads. */
function sheetDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toRow(t: ExportTransaction): string[] {
  const detail = t.payee?.name ?? t.note ?? '';
  const account = t.account ?? (t.payment_method === 'card' ? 'บัตร' : '');
  return [
    sheetDate(t.txn_date),
    t.type === 'income' ? 'รายรับ' : 'รายจ่าย',
    t.category ?? '',
    detail,
    Number(t.amount).toFixed(2),
    account,
    // The note already fills "รายละเอียด" when there is no payee.
    t.payee ? (t.note ?? '') : '',
    t.txn_time?.slice(0, 5) ?? '',
  ];
}

/** Oldest first, like a passbook. */
function byDate(a: ExportTransaction, b: ExportTransaction): number {
  return (
    a.txn_date.localeCompare(b.txn_date) ||
    (a.txn_time ?? '').localeCompare(b.txn_time ?? '') ||
    a.created_at.localeCompare(b.created_at)
  );
}

export function buildExportCsv(transactions: ExportTransaction[]): string {
  const lines = [EXPORT_HEADER, ...[...transactions].sort(byDate).map(toRow)].map((row) => row.map(csvField).join(','));
  // BOM so Excel opens the Thai text as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function exportFileName(from: string, to: string): string {
  return from === to ? `moneytree-${from}.csv` : `moneytree-${from}_${to}.csv`;
}

export interface ExportSummary {
  count: number;
  income: number;
  expense: number;
  savingsCount: number;
}

/** Counts for the preview line; savings moves are counted separately, as on the dashboard. */
export function summarizeExport(transactions: ExportTransaction[]): ExportSummary {
  const summary = { count: transactions.length, income: 0, expense: 0, savingsCount: 0 };
  for (const t of transactions) {
    if (isSavings(t)) summary.savingsCount += 1;
    else summary[t.type] += Number(t.amount);
  }
  return { ...summary, income: Math.round(summary.income * 100) / 100, expense: Math.round(summary.expense * 100) / 100 };
}
