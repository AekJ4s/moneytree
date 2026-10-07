import { useState } from 'react';
import { ImageViewer } from '../../components/Modal';
import { formatMoney, formatThaiDate } from '../../lib/format';
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
  if (transactions.length === 0) return <p className="py-6 text-center text-sm text-slate-400">ไม่มีรายการ</p>;

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
                    t.type === 'income' ? 'bg-emerald-50' : 'bg-rose-50'
                  }`}
                >
                  {t.source === 'recurring' ? '🔁' : t.type === 'income' ? '⬇️' : '⬆️'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {t.payee?.name ?? t.note ?? t.category ?? (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')}
                </div>
                <div className="truncate text-xs text-slate-500">{meta.join(' · ')}</div>
              </div>
              <div
                className={`shrink-0 text-right font-semibold tabular-nums ${
                  t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                }`}
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

export function sumByType(transactions: Transaction[]): { income: number; expense: number } {
  return transactions.reduce(
    (acc, t) => {
      acc[t.type] += Number(t.amount);
      return acc;
    },
    { income: 0, expense: 0 },
  );
}
