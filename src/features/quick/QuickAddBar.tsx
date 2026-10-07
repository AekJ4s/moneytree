import { useState } from 'react';
import { emitDataChanged } from '../../lib/events';
import { formatMoney, todayIso } from '../../lib/format';
import { showToast } from '../../lib/toast';
import { errorMessage } from '../../lib/useAsync';
import { createTransaction, deleteTransaction } from '../transactions/api';
import type { QuickTemplate } from './quickTemplates';

interface Props {
  templates: QuickTemplate[];
  /** Date to record on (defaults to today). */
  date?: string;
  /** ✏️: open the template in the full form to change the amount first. */
  onEdit: (template: QuickTemplate) => void;
  onSaved: () => void;
}

/** One-tap buttons for everyday entries learned from history, with undo. */
export function QuickAddBar({ templates, date, onEdit, onSaved }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  async function record(t: QuickTemplate) {
    setBusyKey(t.key);
    setError(null);
    try {
      const saved = await createTransaction({
        type: t.type,
        amount: t.amount,
        txn_date: date ?? todayIso(),
        payee_id: t.payee_id,
        category: t.category,
        note: t.note,
        payment_method: t.payment_method,
        creditor_id: t.creditor_id,
        account: t.account,
        income_source_id: t.income_source_id,
        source: 'manual',
      });
      emitDataChanged();
      showToast({
        message: `บันทึก ${t.label} ${formatMoney(t.amount)} แล้ว`,
        action: {
          label: 'เลิกทำ',
          run: async () => {
            await deleteTransaction(saved.id);
            emitDataChanged();
            showToast({ message: 'ยกเลิกรายการแล้ว' });
          },
        },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <div className="mb-1 text-xs text-slate-500">⚡ บันทึกด่วน — แตะเพื่อบันทึกทันที · ✏️ เพื่อแก้ยอดก่อน</div>
      <div className="flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <span
            key={t.key}
            className={`inline-flex items-stretch overflow-hidden rounded-full text-sm ring-1 ${
              t.type === 'income' ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-slate-200'
            } ${busyKey === t.key ? 'opacity-50' : ''}`}
          >
            <button
              type="button"
              className="flex items-center gap-1 py-1 pr-1 pl-2.5 hover:bg-slate-50"
              disabled={busyKey !== null}
              onClick={() => void record(t)}
              title={t.payment_method === 'card' ? `จ่ายผ่าน ${t.account ?? 'บัตร'}` : undefined}
            >
              <span>{t.icon}</span>
              <span className="max-w-28 truncate">{t.label}</span>
              <span className={`tabular-nums ${t.type === 'income' ? 'text-emerald-700' : 'text-slate-600'}`}>{formatMoney(t.amount)}</span>
              {t.payment_method === 'card' && <span className="text-xs">💳</span>}
            </button>
            <button
              type="button"
              className="border-l border-slate-200 px-2 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              onClick={() => onEdit(t)}
              aria-label={`แก้ไขก่อนบันทึก ${t.label}`}
            >
              ✏️
            </button>
          </span>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
