import { googleSheetId, parseCsv, TEMPLATE_SHEET_NAME, type CellValue } from './sheetRows';

/** Reads the template tab from an .xlsx file (falls back to the first sheet) or a .csv file. */
export async function readSheetFile(file: File): Promise<CellValue[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return parseCsv(await file.text());
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  const target = sheets.find((s) => s.sheet.trim() === TEMPLATE_SHEET_NAME) ?? sheets[0];
  return target.data as CellValue[][];
}

/**
 * Downloads the template tab of a Google Sheet as CSV. Works for sheets shared as
 * "anyone with the link can view"; Google's gviz endpoint allows cross-origin reads.
 */
export async function fetchGoogleSheet(url: string): Promise<CellValue[][]> {
  const id = googleSheetId(url);
  if (!id) throw new Error('ลิงก์ไม่ใช่ Google Sheets');
  const endpoint = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TEMPLATE_SHEET_NAME)}`;
  const res = await fetch(endpoint);
  const body = await res.text();
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/csv')) {
    throw new Error('ดึงข้อมูลไม่ได้ — ตรวจว่าแชร์ลิงก์แบบ "ทุกคนที่มีลิงก์ดูได้" และมีแท็บชื่อ "รายการ"');
  }
  return parseCsv(body);
}
