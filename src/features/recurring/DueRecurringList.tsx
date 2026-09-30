import { useState } from 'react';
import { ErrorText } from '../../components/Modal';
import { addDays, formatThaiDate, todayIso } from '../../lib/format';
import type { RecurringItem } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { listDueRecurring, recordRecurring, skipRecurring } from './api';

/** Recurring items due within the next week, with one-tap "record" / "skip". */
export function DueRecurringList({ onChanged }: { onChanged?: () => void }) {
  const due = useAsync(() => listDueRecurring(addDays(todayIso(), 7)), []);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(item: RecurringItem, action: 'record' | 'skip') {
    setBusyId(item.id);
    setError(null);
    try {
      if (action === 'record') {
        const amount = Number(amounts[item.id] ?? item.amount);
        if (!(amount > 0)) throw new Error('จำนวนเงินต้องมากกว่า 0');
        await recordRecurring(item.id, amount, item.next_due_date);
      } else {
        await skipRecurring(item.id);
      }
      due.reload();
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const items = due.data ?? [];
  if (!due.loading && items.length === 0 && !due.error) return null;

  return (
    <section className="card border-l-4 border-amber-400">
      <h2 className="mb-2 font-semibold">⏰ รายการประจำที่ถึงกำหนด</h2>
      <ErrorText>{due.error ?? error}</ErrorText>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const overdue = item.next_due_date < todayIso();
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {item.type === 'income' ? '⬇️' : '⬆️'} {item.name}
                </div>
                <div className={`text-xs ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                  {overdue ? 'เลยกำหนด ' : 'กำหนด '}
                  {formatThaiDate(item.next_due_date)}
                </div>
              </div>
              <input
                className="input w-28 text-right"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amounts[item.id] ?? String(item.amount)}
                onChange={(e) => setAmounts((a) => ({ ...a, [item.id]: e.target.value }))}
                aria-label={`จำนวนเงิน ${item.name}`}
              />
              <button className="btn-primary" disabled={busyId === item.id} onClick={() => void act(item, 'record')}>
                บันทึก
              </button>
              <button className="btn-secondary" disabled={busyId === item.id} onClick={() => void act(item, 'skip')}>
                ข้าม
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-400">แก้จำนวนเงินจริงก่อนกดบันทึกได้ (เช่น ค่าไฟเดือนนี้)</p>
    </section>
  );
}
