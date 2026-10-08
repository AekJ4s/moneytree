import { useState } from 'react';
import { Mascot } from '../../components/Brand';
import { ImageViewer } from '../../components/Modal';
import { formatMoney, formatThaiDate } from '../../lib/format';
import { isSavings } from '../../lib/savings';
import type { Transaction, TxnSource } from '../../lib/types';

interface Props {
  transactions: Transaction[];
  slipUrls?: Record<string, string>;
  showDate?: boolean;
  onEdit?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
}

const SOURCE_LABEL: Record<TxnSource, string> = { manual: 'บันทึกเอง', slip: 'สลิป', recurring: 'ประจำ', import: 'นำเข้า' };

export function TransactionList({ transactions, slipUrls = {}, showDate, onEdit, onDelete }: Props) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (transactions.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-slate-500">
        <Mascot className="h-16 opacity-90" />
        ไม่มีรายการ
      </div>
    );

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {transactions.map((t) => {
          const url = t.slip_image_path ? slipUrls[t.slip_image_path] : undefined;
          const meta = [
            showDate && formatThaiDate(t.txn_date),
            t.txn_time?.slice(0, 5),
            t.category,
            t.payment_method === 'card' ? `💳 ${t.account ?? 'บัตร'}` : t.account,
            SOURCE_LABEL[t.source],
            t.payee && t.note,
          ].filter(Boolean);
          return (
            <li key={t.id} className="flex items-center gap-3 py-3">
              {url ? (
                <button onClick={() => setViewing(url)} className="shrink-0" aria-label="ดูสลิป">
                  <img src={url} alt="สลิป" className="h-12 w-12 rounded-md object-cover ring-1 ring-slate-200" />
                </button>
              ) : (
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-lg ${
                    isSavings(t) ? 'bg-amber-50' : t.type === 'income' ? 'bg-emerald-50' : 'bg-rose-50'
                  }`}
                >
                  {isSavings(t) ? '🪙' : t.source === 'recurring' ? '🔁' : t.type === 'income' ? '⬇️' : '⬆️'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {t.payee?.name ?? t.note ?? t.category ?? (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')}
                </div>
                <div className="truncate text-xs text-slate-500">{meta.join(' · ')}</div>
              </div>
              <div
                className={`figure shrink-0 text-right font-medium ${amountColor(t)}`}
              >
                {t.type === 'income' ? '+' : '−'}
                {formatMoney(t.amount)}
              </div>
              {(onEdit || onDelete) && (
                <div className="flex shrink-0 flex-col">
                  {onEdit && (
                    <button className="px-1 text-xs text-slate-500 hover:text-emerald-700" onClick={() => onEdit(t)}>
                      แก้ไข
                    </button>
                  )}
                  {onDelete && (
                    <button className="px-1 text-xs text-slate-400 hover:text-rose-600" onClick={() => onDelete(t)}>
                      ลบ
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {viewing && <ImageViewer src={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** Gold for savings/investments, green for income, red for expenses. */
export function amountColor(t: Pick<Transaction, 'type' | 'category' | 'asset_id'>): string {
  if (isSavings(t)) return 'text-amber-600';
  return t.type === 'income' ? 'text-emerald-600' : 'text-rose-600';
}
