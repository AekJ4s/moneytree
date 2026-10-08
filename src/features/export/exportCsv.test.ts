import { describe, expect, it } from 'vitest';
import { parseCsv, parseSheetRows } from '../import/sheetRows';
import { buildExportCsv, csvField, exportFileName, summarizeExport, type ExportTransaction } from './exportCsv';

const base: ExportTransaction = {
  type: 'expense',
  amount: 0,
  txn_date: '2026-10-01',
  txn_time: null,
  category: null,
  note: null,
  account: null,
  payment_method: 'cash',
  asset_id: null,
  created_at: '2026-10-01T00:00:00Z',
  payee: null,
};
const txn = (patch: Partial<ExportTransaction>): ExportTransaction => ({ ...base, ...patch });

const TXNS: ExportTransaction[] = [
  txn({ txn_date: '2026-10-03', amount: 50, category: 'อาหาร', payee: { name: 'ข้าวมันไก่' }, note: 'ร้านหน้าออฟฟิศ', account: 'ธนาคาร', txn_time: '12:15:00' }),
  txn({ txn_date: '2026-10-01', type: 'income', amount: 28125, category: 'เงินเดือน', note: 'เงินเดือน, ตุลาคม', account: 'ธนาคาร' }),
  txn({ txn_date: '2026-10-02', amount: 1331.82, category: 'ช้อปปิ้ง', note: 'รองเท้า "วิ่ง"', payment_method: 'card' }),
  txn({ txn_date: '2026-10-02', amount: 5000, category: 'ลงทุน', note: 'Dime' }),
];

describe('buildExportCsv', () => {
  const csv = buildExportCsv(TXNS);

  it('starts with a BOM and the template header, oldest row first', () => {
    expect(csv.startsWith('﻿วันที่,ประเภท,หมวดหมู่,รายละเอียด,จำนวนเงิน,บัญชี/ช่องทาง,หมายเหตุ,เวลา\r\n')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('01/10/2026,รายรับ,เงินเดือน,"เงินเดือน, ตุลาคม",28125.00,ธนาคาร,,');
    expect(lines[4]).toBe('03/10/2026,รายจ่าย,อาหาร,ข้าวมันไก่,50.00,ธนาคาร,ร้านหน้าออฟฟิศ,12:15');
  });

  it('labels card spending without an account as บัตร', () => {
    expect(csv).toContain('02/10/2026,รายจ่าย,ช้อปปิ้ง,"รองเท้า ""วิ่ง""",1331.82,บัตร,,');
  });

  it('imports back to the same rows', () => {
    const { rows, headerRecognized } = parseSheetRows(parseCsv(csv));
    expect(headerRecognized).toBe(true);
    expect(rows.map((r) => r.errors)).toEqual([[], [], [], []]);
    expect(rows.map((r) => [r.date, r.type, r.category, r.detail, r.amount, r.account, r.note])).toEqual([
      ['2026-10-01', 'income', 'เงินเดือน', 'เงินเดือน, ตุลาคม', 28125, 'ธนาคาร', null],
      ['2026-10-02', 'expense', 'ช้อปปิ้ง', 'รองเท้า "วิ่ง"', 1331.82, 'บัตร', null],
      ['2026-10-02', 'expense', 'ลงทุน', 'Dime', 5000, null, null],
      ['2026-10-03', 'expense', 'อาหาร', 'ข้าวมันไก่', 50, 'ธนาคาร', 'ร้านหน้าออฟฟิศ'],
    ]);
  });
});

describe('csvField', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('plain')).toBe('plain');
  });

  it('stops spreadsheets from running text as a formula', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+66812345678')).toBe("'+66812345678");
    expect(csvField('-50')).toBe('-50');
  });
});

describe('summarizeExport', () => {
  it('keeps savings moves out of income and expense', () => {
    expect(summarizeExport(TXNS)).toEqual({ count: 4, income: 28125, expense: 1381.82, savingsCount: 1 });
  });
});

describe('exportFileName', () => {
  it('names the file by its date range', () => {
    expect(exportFileName('2026-10-01', '2026-10-31')).toBe('moneytree-2026-10-01_2026-10-31.csv');
    expect(exportFileName('2026-10-08', '2026-10-08')).toBe('moneytree-2026-10-08.csv');
  });
});
