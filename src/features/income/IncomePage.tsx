import { useState, type FormEvent } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { listRecurring } from '../recurring/api';
import { createIncomeSource, deleteIncomeSource, listIncomeSince, listIncomeSources, updateIncomeSource } from './api';
import { INCOME_KINDS, sourceIcon, type IncomeSource, type IncomeSourceKind } from './types';

/** Monthly equivalent of a recurring amount. */
function perMonth(amount: number, unit: 'week' | 'month' | 'year', count: number): number {
  const perUnit = { week: 52 / 12, month: 1, year: 1 / 12 }[unit];
  return (amount * perUnit) / count;
}

/** Jobs / income sources with expected monthly income and what actually came in. */
export function IncomePage() {
  const today = todayIso();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const data = useAsync(() => Promise.all([listIncomeSources(true), listRecurring(), listIncomeSince(yearStart)]), [yearStart]);
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sources, recurring, income] = data.data ?? [[], [], []];
  const rows = sources.map((s) => {
    const items = recurring.filter((r) => r.active && r.type === 'income' && r.income_source_id === s.id);
    const mine = income.filter((i) => i.income_source_id === s.id);
    return {
      source: s,
      items,
      expected: items.reduce((sum, r) => sum + perMonth(Number(r.amount), r.interval_unit, r.interval_count), 0),
      thisMonth: mine.filter((i) => i.txn_date >= monthStart).reduce((sum, i) => sum + i.amount, 0),
      thisYear: mine.reduce((sum, i) => sum + i.amount, 0),
    };
  });
  const unassigned = income.filter((i) => !i.income_source_id);
  const expectedTotal = rows.filter((r) => r.source.active).reduce((s, r) => s + r.expected, 0);
  const recurringWithoutSource = recurring.filter((r) => r.active && r.type === 'income' && !r.income_source_id);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">แหล่งรายได้</h1>
          <p className="text-sm text-slate-500">รายได้ประจำที่คาดว่าจะได้ ≈ {formatMoney(expectedTotal)} / เดือน</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + แหล่งรายได้
        </button>
      </div>
      <ErrorText>{data.error ?? error}</ErrorText>

      {recurringWithoutSource.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          มีรายรับประจำ {recurringWithoutSource.length} รายการที่ยังไม่ระบุแหล่ง ({recurringWithoutSource.map((r) => r.name).join(', ')}) แก้ได้ที่หน้ารายการประจำ
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.source.id} className={`card space-y-2 ${r.source.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-2xl">{sourceIcon(r.source)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.source.name}</div>
                <div className="text-xs text-slate-500">
                  {INCOME_KINDS[r.source.kind].label}
                  {!r.source.active && ' · หยุดแล้ว'}
                </div>
              </div>
              <button className="text-xs text-slate-500 hover:text-emerald-700" onClick={() => setEditing(r.source)}>
                แก้ไข
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Figure label="ประจำ/เดือน" value={r.expected} />
              <Figure label="ได้รับเดือนนี้" value={r.thisMonth} />
              <Figure label="ทั้งปีนี้" value={r.thisYear} />
            </div>
            {r.items.length > 0 && <p className="text-xs text-slate-500">🔁 {r.items.map((i) => i.name).join(', ')}</p>}
          </div>
        ))}
        {!data.loading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 sm:col-span-2">ยังไม่มีแหล่งรายได้ เพิ่มได้ เช่น บริษัทที่ทำงาน โปรเจคส่วนตัว หรือเงินจากบุพการี</p>
        )}
      </div>

      {unassigned.length > 0 && (
        <p className="text-xs text-slate-500">
          รายรับปีนี้ที่ไม่ระบุแหล่ง {formatMoney(unassigned.reduce((s, i) => s + i.amount, 0))} ({unassigned.length} รายการ)
        </p>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'เพิ่มแหล่งรายได้' : 'แก้ไขแหล่งรายได้'} onClose={() => setEditing(null)}>
          <SourceForm
            initial={editing === 'new' ? undefined : editing}
            onSave={(input) => run(async () => {
              if (editing === 'new') await createIncomeSource({ ...input, note: null });
              else await updateIncomeSource(editing.id, input);
              setEditing(null);
            })}
            onToggleActive={editing === 'new' ? undefined : () => run(async () => {
              await updateIncomeSource(editing.id, { active: !editing.active });
              setEditing(null);
            })}
            onDelete={editing === 'new' ? undefined : () => {
              if (!confirm(`ลบ "${editing.name}"? รายการเดิมจะยังอยู่แต่ไม่ระบุแหล่ง`)) return;
              void run(async () => {
                await deleteIncomeSource(editing.id);
                setEditing(null);
              });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums text-emerald-700">{formatMoney(value)}</div>
    </div>
  );
}

interface SourceFormProps {
  initial?: IncomeSource;
  onSave: (input: { name: string; kind: IncomeSourceKind; icon: string | null }) => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
}

function SourceForm({ initial, onSave, onToggleActive, onDelete }: SourceFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<IncomeSourceKind>(initial?.kind ?? 'job');
  const [icon, setIcon] = useState(initial?.icon ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) onSave({ name: name.trim(), kind, icon: icon.trim() || null });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">ไอคอน</span>
          <input className="input mt-1 text-center text-xl" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder={INCOME_KINDS[kind].icon} maxLength={4} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">ชื่อ</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บริษัท A" required autoFocus />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(INCOME_KINDS) as IncomeSourceKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-sm ${kind === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {INCOME_KINDS[k].icon} {INCOME_KINDS[k].label}
          </button>
        ))}
      </div>
      <button className="btn-primary w-full">บันทึก</button>
      {(onToggleActive || onDelete) && (
        <div className="flex justify-end gap-2">
          {onToggleActive && (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={onToggleActive}>
              {initial?.active ? 'หยุดใช้ (เช่น ลาออกแล้ว)' : 'เปิดใช้อีกครั้ง'}
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={onDelete}>
              ลบ
            </button>
          )}
        </div>
      )}
    </form>
  );
}
