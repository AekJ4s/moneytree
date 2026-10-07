import { useState, type FormEvent } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { TypeToggle } from '../../components/TypeToggle';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { describeRecurrence, firstDueOnOrAfter, upcomingDueDates, type RecurrenceRule } from '../../lib/recurrence';
import type { IntervalUnit, Payee, RecurringItem, TxnType } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { ensurePayee, listPayees } from '../payees/api';
import { listCategories } from '../transactions/api';
import { PayeeCategoryOptions } from '../transactions/TransactionForm';
import { createRecurring, deleteRecurring, listRecurring, updateRecurring } from './api';
import { DueRecurringList } from './DueRecurringList';

export function RecurringPage() {
  const items = useAsync(listRecurring, []);
  const lookups = useAsync(() => Promise.all([listPayees(), listCategories()]), []);
  const [editing, setEditing] = useState<RecurringItem | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(item: RecurringItem) {
    try {
      await updateRecurring(item.id, { active: !item.active });
      items.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(item: RecurringItem) {
    if (!confirm(`ลบ "${item.name}"? (รายการที่บันทึกไปแล้วจะยังอยู่)`)) return;
    try {
      await deleteRecurring(item.id);
      items.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const all = items.data ?? [];
  const groups: [TxnType, string][] = [
    ['income', 'รายรับประจำ'],
    ['expense', 'รายจ่ายประจำ'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">รายการประจำ</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + เพิ่มรายการประจำ
        </button>
      </div>

      <DueRecurringList onChanged={items.reload} />

      <ErrorText>{items.error ?? error}</ErrorText>
      {groups.map(([type, title]) => {
        const list = all.filter((i) => i.type === type);
        const monthly = list
          .filter((i) => i.active)
          .reduce((sum, i) => sum + monthlyEquivalent(i), 0);
        return (
          <section key={type} className="card">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-semibold">{title}</h2>
              <span className="text-sm text-slate-500">≈ {formatMoney(monthly)} / เดือน</span>
            </div>
            {list.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีรายการ</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((item) => (
                  <li key={item.id} className={`flex items-center gap-3 py-3 ${item.active ? '' : 'opacity-50'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {describeRecurrence(item)} · ครั้งถัดไป {formatThaiDate(item.next_due_date)}
                        {item.category && ` · ${item.category}`}
                        {!item.active && ' · หยุดไว้'}
                      </div>
                    </div>
                    <div className={`font-semibold tabular-nums ${type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatMoney(item.amount)}
                    </div>
                    <div className="flex flex-col text-xs">
                      <button className="px-1 text-slate-500 hover:text-emerald-700" onClick={() => setEditing(item)}>
                        แก้ไข
                      </button>
                      <button className="px-1 text-slate-500 hover:text-amber-600" onClick={() => void toggleActive(item)}>
                        {item.active ? 'หยุด' : 'เปิดใช้'}
                      </button>
                      <button className="px-1 text-slate-400 hover:text-rose-600" onClick={() => void remove(item)}>
                        ลบ
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editing && (
        <Modal title={editing === 'new' ? 'เพิ่มรายการประจำ' : 'แก้ไขรายการประจำ'} onClose={() => setEditing(null)}>
          <RecurringForm
            initial={editing === 'new' ? undefined : editing}
            payees={lookups.data?.[0] ?? []}
            categories={lookups.data?.[1] ?? []}
            onSaved={() => {
              setEditing(null);
              items.reload();
              lookups.reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function monthlyEquivalent(item: RecurringItem): number {
  const perUnit = { week: 52 / 12, month: 1, year: 1 / 12 }[item.interval_unit];
  return (Number(item.amount) * perUnit) / item.interval_count;
}

function buildRule(unit: IntervalUnit, count: number, anchor: string): RecurrenceRule {
  const anchored = unit !== 'week';
  return {
    interval_unit: unit,
    interval_count: count,
    due_day: anchored && anchor !== 'last' ? Number(anchor) : null,
    due_last_day: anchored && anchor === 'last',
  };
}

interface FormProps {
  initial?: RecurringItem;
  payees: Payee[];
  categories: string[];
  onSaved: () => void;
}

function RecurringForm({ initial, payees, categories, onSaved }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TxnType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [intervalCount, setIntervalCount] = useState(initial?.interval_count ?? 1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.interval_unit ?? 'month');
  const [nextDue, setNextDue] = useState(initial?.next_due_date ?? todayIso());
  // "last" = last day of the month, otherwise the day number (monthly/yearly items only).
  const [anchor, setAnchor] = useState<string>(
    initial?.due_last_day ? 'last' : String(initial?.due_day ?? Number(nextDue.slice(8, 10))),
  );
  const [payeeName, setPayeeName] = useState(payees.find((p) => p.id === initial?.payee_id)?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anchored = intervalUnit !== 'week';
  const rule = buildRule(intervalUnit, intervalCount, anchor);
  const preview = nextDue && intervalCount >= 1 ? upcomingDueDates(nextDue, rule, 3) : [];

  /** Re-schedules the next due date when the day rule changes. */
  function applyRule(unit: IntervalUnit, newAnchor: string) {
    setIntervalUnit(unit);
    setAnchor(newAnchor);
    if (unit === 'week') return;
    // New items start from today; edits stay within the currently scheduled month.
    const from = initial ? `${nextDue.slice(0, 8)}01` : todayIso();
    setNextDue(firstDueOnOrAfter(from, buildRule(unit, intervalCount, newAnchor)));
  }

  /** Picking a specific date also sets the day rule, unless the rule is "last day of month". */
  function onNextDueChange(value: string) {
    setNextDue(value);
    if (value && anchor !== 'last') setAnchor(String(Number(value.slice(8, 10))));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    if (!(intervalCount >= 1 && intervalCount <= 60)) return setError('ความถี่ต้องอยู่ระหว่าง 1–60');
    setBusy(true);
    setError(null);
    try {
      const payee = payeeName.trim() ? await ensurePayee(payeeName, type, category.trim() || null) : null;
      const input = {
        name: name.trim(),
        type,
        amount: value,
        interval_count: intervalCount,
        interval_unit: intervalUnit,
        next_due_date: nextDue,
        due_day: rule.due_day,
        due_last_day: rule.due_last_day,
        payee_id: payee?.id ?? null,
        category: category.trim() || null,
        note: null,
        active: initial?.active ?? true,
      };
      if (initial) await updateRecurring(initial.id, input);
      else await createRecurring(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <TypeToggle value={type} onChange={setType} />
      <label className="block">
        <span className="text-sm text-slate-600">ชื่อรายการ</span>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เงินเดือน, ค่าไฟ, ค่าน้ำ" required />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">จำนวนเงิน (ประมาณการ แก้ได้ตอนบันทึกจริง)</span>
        <input className="input mt-1" type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
        <span className="pb-2 text-sm text-slate-600">ทุก</span>
        <input className="input" type="number" min={1} max={60} value={intervalCount} onChange={(e) => setIntervalCount(Number(e.target.value))} />
        <select className="input" value={intervalUnit} onChange={(e) => applyRule(e.target.value as IntervalUnit, anchor)}>
          <option value="week">สัปดาห์</option>
          <option value="month">เดือน</option>
          <option value="year">ปี</option>
        </select>
      </div>
      {anchored && (
        <label className="block">
          <span className="text-sm text-slate-600">ครบกำหนดวันที่</span>
          <select className="input mt-1" value={anchor} onChange={(e) => applyRule(intervalUnit, e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                วันที่ {i + 1}
              </option>
            ))}
            <option value="last">วันสุดท้ายของเดือน</option>
          </select>
          {Number(anchor) >= 29 && (
            <span className="mt-1 block text-xs text-slate-500">เดือนที่ไม่มีวันที่ {anchor} จะใช้วันสุดท้ายของเดือนแทน</span>
          )}
        </label>
      )}
      <label className="block">
        <span className="text-sm text-slate-600">ครบกำหนดครั้งถัดไป</span>
        <input className="input mt-1" type="date" value={nextDue} onChange={(e) => onNextDueChange(e.target.value)} required />
      </label>
      {preview.length > 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {describeRecurrence(rule)} — ครั้งต่อไป: {preview.map((d) => formatThaiDate(d)).join(', ')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">ผู้รับ / ที่มา</span>
          <input className="input mt-1" list="payee-options" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">หมวดหมู่</span>
          <input className="input mt-1" list="category-options" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
      </div>
      <PayeeCategoryOptions payees={payees} categories={categories} />
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
