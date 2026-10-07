/**
 * Converts rows from the "รายการ" tab of the finance template into transactions.
 * Columns: วันที่ | ประเภท | หมวดหมู่ | รายละเอียด | จำนวนเงิน | บัญชี/ช่องทาง | หมายเหตุ
 */
import type { TxnType } from '../../lib/types';

export const TEMPLATE_SHEET_NAME = 'รายการ';

export type CellValue = string | number | boolean | Date | null | undefined;

type Field = 'date' | 'type' | 'category' | 'detail' | 'amount' | 'account' | 'note';

const HEADER_ALIASES: Record<Field, string[]> = {
  date: ['วันที่', 'date'],
  type: ['ประเภท', 'type'],
  category: ['หมวดหมู่', 'หมวด', 'category'],
  detail: ['รายละเอียด', 'รายการ', 'detail', 'description'],
  amount: ['จำนวนเงิน', 'จำนวน', 'amount'],
  account: ['บัญชี/ช่องทาง', 'บัญชี', 'ช่องทาง', 'account'],
  note: ['หมายเหตุ', 'note', 'remark'],
};

/** Template column order, used when the header row can't be recognised. */
const DEFAULT_COLUMNS: Field[] = ['date', 'type', 'category', 'detail', 'amount', 'account', 'note'];

const TYPE_VALUES: Record<string, TxnType | 'transfer'> = {
  รายรับ: 'income',
  income: 'income',
  รายจ่าย: 'expense',
  expense: 'expense',
  โอนเงิน: 'transfer',
  transfer: 'transfer',
};

export type RowStatus = 'new' | 'imported' | 'possible-duplicate' | 'transfer' | 'invalid';

export interface ParsedRow {
  /** 1-based row number in the sheet, for messages. */
  rowNumber: number;
  date: string | null;
  type: TxnType | 'transfer' | null;
  category: string | null;
  detail: string | null;
  amount: number | null;
  account: string | null;
  note: string | null;
  errors: string[];
  /** Content fingerprint plus occurrence index; identical rows in one sheet stay distinct. */
  fingerprint: string;
}

function text(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

function normalizeHeader(value: CellValue): string {
  return (text(value) ?? '').toLowerCase().replace(/\s/g, '');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y > 2400) y -= 543; // Buddhist Era
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial day number (1900 date system) to YYYY-MM-DD. */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Accepts Date cells, Excel serials, "dd/mm/yyyy" (CE or BE) and "yyyy-mm-dd". */
export function parseSheetDate(value: CellValue): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Spreadsheet readers return date-only cells as UTC midnight.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'number') return fromExcelSerial(value);
  const s = text(value);
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

export function parseSheetAmount(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = text(value);
  if (!s) return null;
  const cleaned = s.replace(/[,\s฿]|บาท/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function mapColumns(header: CellValue[]): Map<Field, number> | null {
  const normalized = header.map(normalizeHeader);
  const map = new Map<Field, number>();
  for (const field of DEFAULT_COLUMNS) {
    const idx = normalized.findIndex((h) => HEADER_ALIASES[field].some((a) => h === a.toLowerCase().replace(/\s/g, '')));
    if (idx >= 0) map.set(field, idx);
  }
  // Date, type and amount are essential; anything less means this isn't a header row.
  return map.has('date') && map.has('type') && map.has('amount') ? map : null;
}

function isBlank(row: CellValue[]): boolean {
  return row.every((v) => text(v) === null);
}

export interface ParseResult {
  rows: ParsedRow[];
  /** True when the header row matched the template; false means columns were read by position. */
  headerRecognized: boolean;
}

export function parseSheetRows(sheet: CellValue[][]): ParseResult {
  const headerIndex = sheet.findIndex((r) => !isBlank(r));
  const header = headerIndex >= 0 ? mapColumns(sheet[headerIndex]) : null;
  const columns = header ?? new Map(DEFAULT_COLUMNS.map((f, i) => [f, i] as const));
  const startIndex = header ? headerIndex + 1 : 0;

  const seen = new Map<string, number>();
  const rows: ParsedRow[] = [];
  for (let i = startIndex; i < sheet.length; i += 1) {
    const raw = sheet[i] ?? [];
    if (isBlank(raw)) continue;
    const cell = (f: Field) => {
      const idx = columns.get(f);
      return idx === undefined ? null : raw[idx];
    };

    const errors: string[] = [];
    const date = parseSheetDate(cell('date'));
    if (!date) errors.push('วันที่ไม่ถูกต้อง');
    const typeText = text(cell('type'));
    const type = typeText ? (TYPE_VALUES[typeText.toLowerCase()] ?? null) : null;
    if (!type) errors.push(typeText ? `ประเภท "${typeText}" ไม่รู้จัก` : 'ไม่มีประเภท');
    const amountRaw = parseSheetAmount(cell('amount'));
    const amount = amountRaw === null ? null : Math.abs(amountRaw);
    if (!amount) errors.push('จำนวนเงินไม่ถูกต้อง');

    const row = {
      rowNumber: i + 1,
      date,
      type,
      category: text(cell('category')),
      detail: text(cell('detail')),
      amount,
      account: text(cell('account')),
      note: text(cell('note')),
    };
    const content = [row.date, row.type, row.category, row.detail, row.amount?.toFixed(2), row.account, row.note]
      .map((v) => v ?? '')
      .join('|');
    const occurrence = (seen.get(content) ?? 0) + 1;
    seen.set(content, occurrence);
    rows.push({ ...row, errors, fingerprint: `${content}#${occurrence}` });
  }
  return { rows, headerRecognized: header !== null };
}

/** SHA-256 hex of a fingerprint; this is what's stored in transactions.import_key. */
export async function importKey(fingerprint: string): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = input.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Extracts the spreadsheet id from a Google Sheets URL. */
export function googleSheetId(url: string): string | null {
  return /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url)?.[1] ?? null;
}
