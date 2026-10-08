import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText } from '../../components/Modal';
import { downloadText } from '../../lib/download';
import { formatMoney, formatThaiDate } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { ExportPanel } from '../export/ExportPanel';
import { findImportedKeys, insertImported, listNonImportedInRange } from './api';
import { classifyRows, toImportTransaction, type PreviewRow } from './importPreview';
import { fetchGoogleSheet, readSheetFile } from './loadSheet';
import { importKey, parseSheetRows, TEMPLATE_SHEET_NAME, type CellValue, type RowStatus } from './sheetRows';

const LAST_LINK_KEY = 'moneytree.import.lastLink';

const STATUS_META: Record<RowStatus, { label: string; className: string }> = {
  new: { label: 'ใหม่', className: 'bg-emerald-100 text-emerald-700' },
  'possible-duplicate': { label: 'อาจซ้ำกับรายการเดิม', className: 'bg-amber-100 text-amber-800' },
  imported: { label: 'นำเข้าแล้ว', className: 'bg-slate-200 text-slate-600' },
  transfer: { label: 'โอนเงิน (ไม่นับ)', className: 'bg-sky-100 text-sky-700' },
  invalid: { label: 'ข้อมูลไม่ครบ', className: 'bg-rose-100 text-rose-700' },
};

const TEMPLATE_HEADER = ['วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน', 'บัญชี/ช่องทาง', 'หมายเหตุ'];

function readLastLink(): string {
  try {
    return localStorage.getItem(LAST_LINK_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLastLink(link: string) {
  try {
    localStorage.setItem(LAST_LINK_KEY, link);
  } catch {
    // Storage unavailable (private mode); remembering the link is only a convenience.
  }
}

function downloadTemplate() {
  const csv = `﻿${TEMPLATE_HEADER.join(',')}\n01/10/2026,รายจ่าย,อาหาร,ข้าวกะเพรา,60,ธนาคาร,\n`;
  downloadText('moneytree-template.csv', csv);
}

export function ImportPage() {
  const [link, setLink] = useState(readLastLink);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<CellValue[][] | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [headerRecognized, setHeaderRecognized] = useState(true);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function buildPreview(data: CellValue[][]) {
    const parsed = parseSheetRows(data);
    const withKeys = await Promise.all(parsed.rows.map(async (r) => ({ ...r, key: await importKey(r.fingerprint) })));
    const dates = withKeys.map((r) => r.date).filter((d): d is string => !!d).sort();
    const [imported, existing] = await Promise.all([
      findImportedKeys(withKeys.map((r) => r.key)),
      dates.length ? listNonImportedInRange(dates[0], dates[dates.length - 1]) : Promise.resolve([]),
    ]);
    setRows(classifyRows(withKeys, imported, existing));
    setHeaderRecognized(parsed.headerRecognized);
  }

  async function load(getData: () => Promise<CellValue[][]>, label: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getData();
      setSheet(data);
      setSourceLabel(label);
      await buildPreview(data);
    } catch (err) {
      setRows([]);
      setSheet(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void load(() => readSheetFile(file), file.name);
  }

  function onLink(e: FormEvent) {
    e.preventDefault();
    const trimmed = link.trim();
    if (!trimmed) return;
    saveLastLink(trimmed);
    void load(() => fetchGoogleSheet(trimmed), 'Google Sheets');
  }

  function toggle(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)));
  }

  async function runImport() {
    const chosen = rows.filter((r) => r.selected);
    if (chosen.length === 0 || !sheet) return;
    setImporting(true);
    setError(null);
    try {
      await insertImported(chosen.map(toImportTransaction));
      await buildPreview(sheet);
      setResult(`นำเข้าแล้ว ${chosen.length} รายการ`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const counts = rows.reduce<Record<RowStatus, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { new: 0, 'possible-duplicate': 0, imported: 0, transfer: 0, invalid: 0 },
  );
  const selected = rows.filter((r) => r.selected);
  const selectedNet = selected.reduce((s, r) => s + (r.type === 'income' ? 1 : -1) * (r.amount ?? 0), 0);
  const selectableStatuses: RowStatus[] = ['new', 'possible-duplicate'];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">นำเข้า/ส่งออก</h1>
      <ExportPanel />

      <div>
        <h2 className="text-lg font-semibold">นำเข้าจาก Excel / Google Sheets</h2>
        <p className="text-sm text-slate-500">
          อ่านแท็บ “{TEMPLATE_SHEET_NAME}” (วันที่ · ประเภท · หมวดหมู่ · รายละเอียด · จำนวนเงิน · บัญชี/ช่องทาง · หมายเหตุ)
          นำเข้าไฟล์เดิมซ้ำได้ ระบบจะเพิ่มเฉพาะแถวใหม่
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="font-semibold">📄 อัปโหลดไฟล์</h2>
          <p className="text-xs text-slate-500">.xlsx (จะหาแท็บ “{TEMPLATE_SHEET_NAME}” ให้อัตโนมัติ) หรือ .csv</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
              เลือกไฟล์
            </button>
            <button className="btn-secondary" onClick={downloadTemplate} type="button">
              ดาวน์โหลด template
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={onFile}
          />
        </section>

        <form className="card space-y-2" onSubmit={onLink}>
          <h2 className="font-semibold">🔗 ลิงก์ Google Sheets</h2>
          <p className="text-xs text-slate-500">ต้องแชร์แบบ “ทุกคนที่มีลิงก์ดูได้”</p>
          <div className="flex gap-2">
            <input
              className="input"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={loading || !link.trim()}>
              ดึงข้อมูล
            </button>
          </div>
        </form>
      </div>

      {loading && <p className="animate-pulse text-sm text-slate-500">กำลังอ่านข้อมูลและตรวจรายการซ้ำ…</p>}
      <ErrorText>{error}</ErrorText>
      {result && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ {result} · <Link to="/daily" className="underline">ดูรายวัน</Link>
        </p>
      )}

      {rows.length > 0 && !loading && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {sourceLabel} · {rows.length} แถว
            </span>
            {(Object.keys(STATUS_META) as RowStatus[])
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <span key={s} className={`rounded-full px-2 py-0.5 text-xs ${STATUS_META[s].className}`}>
                  {STATUS_META[s].label} {counts[s]}
                </span>
              ))}
            <button
              className="btn-primary ml-auto"
              disabled={importing || selected.length === 0}
              onClick={() => void runImport()}
            >
              {importing ? 'กำลังนำเข้า…' : `นำเข้า ${selected.length} รายการ (สุทธิ ${formatMoney(selectedNet)})`}
            </button>
          </div>
          {!headerRecognized && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ไม่พบหัวตารางตาม template จึงอ่านคอลัมน์ตามลำดับ A–G แทน กรุณาตรวจความถูกต้องก่อนนำเข้า
            </p>
          )}
          {counts['possible-duplicate'] > 0 && (
            <p className="text-xs text-amber-700">
              แถวสีเหลืองมีวันที่ ประเภท และยอดตรงกับรายการที่บันทึกจากสลิป/บันทึกเองแล้ว ระบบจึงไม่เลือกไว้ ถ้าเป็นคนละรายการให้ติ๊กเอง
            </p>
          )}

          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2" />
                  <th className="py-2">แถว</th>
                  <th className="py-2">วันที่</th>
                  <th className="py-2">รายละเอียด</th>
                  <th className="py-2">หมวดหมู่</th>
                  <th className="py-2 text-right">จำนวนเงิน</th>
                  <th className="px-4 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={r.key} className={r.selected ? '' : 'text-slate-400'}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        disabled={!selectableStatuses.includes(r.status)}
                        onChange={() => toggle(i)}
                        aria-label={`เลือกแถว ${r.rowNumber}`}
                      />
                    </td>
                    <td className="py-2 tabular-nums">{r.rowNumber}</td>
                    <td className="py-2 whitespace-nowrap">{r.date ? formatThaiDate(r.date) : '—'}</td>
                    <td className="max-w-56 py-2">
                      <div className="truncate">{r.detail ?? '—'}</div>
                      {(r.account || r.note) && (
                        <div className="truncate text-xs text-slate-400">{[r.account, r.note].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="py-2">{r.category ?? '—'}</td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${
                        r.type === 'income' ? 'text-emerald-600' : r.type === 'expense' ? 'text-rose-600' : ''
                      }`}
                    >
                      {r.amount !== null ? formatMoney(r.amount) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_META[r.status].className}`}>
                        {STATUS_META[r.status].label}
                      </span>
                      {r.errors.length > 0 && <div className="mt-1 text-xs text-rose-600">{r.errors.join(', ')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
