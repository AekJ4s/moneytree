import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { downloadText } from '../../lib/download';
import { formatMoney, monthRange } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { listAllTransactions } from '../transactions/api';
import { buildExportCsv, exportFileName, summarizeExport } from './exportCsv';

type Preset = 'this-month' | 'last-month' | 'this-year';

function presetRange(preset: Preset, now = new Date()): { from: string; to: string } {
  const year = now.getFullYear();
  if (preset === 'this-month') return monthRange(year, now.getMonth());
  if (preset === 'last-month') return monthRange(year, now.getMonth() - 1);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this-month', label: 'เดือนนี้' },
  { value: 'last-month', label: 'เดือนที่แล้ว' },
  { value: 'this-year', label: 'ปีนี้' },
];

/** Downloads income and expenses between two dates as a CSV in the import template's columns. */
export function ExportPanel() {
  const [range, setRange] = useState(() => presetRange('this-month'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function update(next: { from: string; to: string }) {
    setRange(next);
    setError(null);
    setDone(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!range.from || !range.to) return setError('เลือกวันที่เริ่มและวันที่สิ้นสุด');
    if (range.from > range.to) return setError('วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด');
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const transactions = await listAllTransactions(range.from, range.to);
      if (transactions.length === 0) return setError('ไม่มีรายการในช่วงวันที่นี้');
      downloadText(exportFileName(range.from, range.to), buildExportCsv(transactions));
      const s = summarizeExport(transactions);
      setDone(
        `ส่งออกแล้ว ${s.count} รายการ: รับ ${formatMoney(s.income)} จ่าย ${formatMoney(s.expense)}` +
          (s.savingsCount ? ` และรายการออม/ลงทุน ${s.savingsCount} รายการ` : ''),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card space-y-3" onSubmit={onSubmit}>
      <div>
        <h2 className="font-semibold">ส่งออกรายรับรายจ่าย</h2>
        <p className="text-xs text-slate-500">ไฟล์ .csv เปิดใน Excel หรือ Google Sheets ได้ และใช้คอลัมน์เดียวกับ template จึงนำเข้ากลับมาได้</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const r = presetRange(p.value);
          const active = r.from === range.from && r.to === range.to;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={active}
              className={`rounded-md px-2.5 py-1 text-sm ring-1 ${active ? 'bg-emerald-50 font-medium text-emerald-700 ring-emerald-600' : 'text-slate-600 ring-slate-300 hover:bg-slate-50'}`}
              onClick={() => update(r)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[9rem] flex-1">
          <span className="text-sm text-slate-600">ตั้งแต่วันที่</span>
          <input className="input mt-1" type="date" value={range.from} max={range.to || undefined} onChange={(e) => update({ ...range, from: e.target.value })} required />
        </label>
        <label className="block min-w-[9rem] flex-1">
          <span className="text-sm text-slate-600">ถึงวันที่</span>
          <input className="input mt-1" type="date" value={range.to} min={range.from || undefined} onChange={(e) => update({ ...range, to: e.target.value })} required />
        </label>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'กำลังส่งออก…' : 'ดาวน์โหลด .csv'}
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{done}</p>}
    </form>
  );
}
