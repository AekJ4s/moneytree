import { describe, expect, it } from 'vitest';
import { classifyRows, toImportTransaction } from './importPreview';
import { googleSheetId, importKey, parseCsv, parseSheetAmount, parseSheetDate, parseSheetRows, type CellValue } from './sheetRows';

const HEADER = ['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน', 'บัญชี/ช่องทาง', 'หมายเหตุ'];
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Same rows as an .xlsx reader returns them (Date cells, numeric amounts).
const XLSX_ROWS: CellValue[][] = [
  HEADER,
  [d('2026-10-01'), 'รายรับ', 'เงินเดือน', 'เงินเดือนประจำเดือน', 28125, 'ธนาคาร', null],
  [d('2026-10-01'), 'รายจ่าย', 'ค่าน้ำ/ไฟ/เน็ต', null, 1331.82, 'ธนาคาร', 'บิลนี้เกิดวันที่ 31'],
  [d('2026-10-03'), 'รายจ่าย', 'อาหาร', 'น้ำเปล่า', 10, 'ธนาคาร', null],
  [d('2026-10-03'), 'รายจ่าย', 'อาหาร', 'น้ำเปล่า', 10, 'ธนาคาร', null],
  [null, null, null, null, null, null, null],
  [d('2026-10-04'), 'โอนเงิน', null, 'ย้ายเข้าออมทรัพย์', 500, 'ธนาคาร', null],
];

// The same sheet as Google's CSV export (formatted strings).
const CSV = `"วันที่","ประเภท","หมวดหมู่","รายละเอียด","จำนวนเงิน","บัญชี/ช่องทาง","หมายเหตุ"
"01/10/2026","รายรับ","เงินเดือน","เงินเดือนประจำเดือน","28,125.00","ธนาคาร",""
"01/10/2026","รายจ่าย","ค่าน้ำ/ไฟ/เน็ต","","1,331.82","ธนาคาร","บิลนี้เกิดวันที่ 31"
"03/10/2026","รายจ่าย","อาหาร","น้ำเปล่า","10","ธนาคาร",""
"03/10/2026","รายจ่าย","อาหาร","น้ำเปล่า","10","ธนาคาร",""
"","","","","","",""
"04/10/2026","โอนเงิน","","ย้ายเข้าออมทรัพย์","500","ธนาคาร",""
`;

describe('parseSheetDate', () => {
  it('handles Date cells, dd/mm/yyyy (CE and BE), ISO and Excel serials', () => {
    expect(parseSheetDate(d('2026-10-01'))).toBe('2026-10-01');
    expect(parseSheetDate('01/10/2026')).toBe('2026-10-01');
    expect(parseSheetDate('1/10/2569')).toBe('2026-10-01');
    expect(parseSheetDate('2026-10-01')).toBe('2026-10-01');
    expect(parseSheetDate(46296)).toBe('2026-10-01');
    expect(parseSheetDate('31/02/2026')).toBeNull();
    expect(parseSheetDate('')).toBeNull();
  });
});

describe('parseSheetAmount', () => {
  it('handles numbers and formatted strings', () => {
    expect(parseSheetAmount(70)).toBe(70);
    expect(parseSheetAmount('28,125.00')).toBe(28125);
    expect(parseSheetAmount('฿ 1,331.82')).toBe(1331.82);
    expect(parseSheetAmount('abc')).toBeNull();
  });
});

describe('parseSheetRows', () => {
  const { rows, headerRecognized } = parseSheetRows(XLSX_ROWS);

  it('maps template columns and skips blank rows', () => {
    expect(headerRecognized).toBe(true);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      date: '2026-10-01',
      type: 'income',
      category: 'เงินเดือน',
      detail: 'เงินเดือนประจำเดือน',
      amount: 28125,
      account: 'ธนาคาร',
      note: null,
      errors: [],
    });
    expect(rows[4]).toMatchObject({ rowNumber: 7, type: 'transfer' });
  });

  it('keeps identical rows distinct (two real purchases)', () => {
    expect(rows[2].fingerprint).not.toBe(rows[3].fingerprint);
  });

  it('produces the same fingerprints from .xlsx and Google Sheets CSV', () => {
    const fromCsv = parseSheetRows(parseCsv(CSV)).rows.map((r) => r.fingerprint);
    expect(fromCsv).toEqual(rows.map((r) => r.fingerprint));
  });

  it('reports invalid rows', () => {
    const bad = parseSheetRows([HEADER, ['ไม่ใช่วันที่', 'อื่นๆ', null, null, 'x', null, null]]).rows[0];
    expect(bad.errors).toEqual(['วันที่ไม่ถูกต้อง', 'ประเภท "อื่นๆ" ไม่รู้จัก', 'จำนวนเงินไม่ถูกต้อง']);
  });

  it('falls back to column order when there is no header', () => {
    const result = parseSheetRows([[d('2026-10-05'), 'รายจ่าย', 'อาหาร', 'น้ำ', 30, null, null]]);
    expect(result.headerRecognized).toBe(false);
    expect(result.rows[0]).toMatchObject({ date: '2026-10-05', amount: 30 });
  });
});

describe('classifyRows', () => {
  async function keyed() {
    const { rows } = parseSheetRows(XLSX_ROWS);
    return Promise.all(rows.map(async (r) => ({ ...r, key: await importKey(r.fingerprint) })));
  }

  it('marks previously imported rows so re-uploading adds nothing', async () => {
    const rows = await keyed();
    const first = classifyRows(rows, new Set(), []);
    expect(first.map((r) => r.status)).toEqual(['new', 'new', 'new', 'new', 'transfer']);

    const imported = new Set(first.filter((r) => r.selected).map((r) => r.key));
    const second = classifyRows(rows, imported, []);
    expect(second.filter((r) => r.selected)).toHaveLength(0);
    expect(second.map((r) => r.status)).toEqual(['imported', 'imported', 'imported', 'imported', 'transfer']);
  });

  it('flags one sheet row per matching slip/manual entry as a possible duplicate', async () => {
    const rows = await keyed();
    const result = classifyRows(rows, new Set(), [{ txn_date: '2026-10-03', type: 'expense', amount: 10 }]);
    expect(result[2]).toMatchObject({ status: 'possible-duplicate', selected: false });
    expect(result[3]).toMatchObject({ status: 'new', selected: true });
  });

  it('builds the transaction payload', async () => {
    const [, bill] = classifyRows(await keyed(), new Set(), []);
    expect(toImportTransaction(bill)).toMatchObject({
      type: 'expense',
      amount: 1331.82,
      txn_date: '2026-10-01',
      category: 'ค่าน้ำ/ไฟ/เน็ต',
      note: 'บิลนี้เกิดวันที่ 31',
      account: 'ธนาคาร',
    });
  });
});

describe('googleSheetId', () => {
  it('extracts the id from share links', () => {
    expect(googleSheetId('https://docs.google.com/spreadsheets/d/abc_DEF-123/edit?usp=sharing')).toBe('abc_DEF-123');
    expect(googleSheetId('https://example.com')).toBeNull();
  });
});
