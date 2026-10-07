import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorText, ImageViewer, Modal } from '../../components/Modal';
import { Stat } from '../../components/Stat';
import { formatMoney, formatThaiDate, monthRange, parseIsoDate, todayIso, toIsoDate } from '../../lib/format';
import type { Transaction } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { listPayees } from '../payees/api';
import { removeSlipImage, signSlipUrls } from '../slips/storage';
import { deleteTransaction, listCategories, listTransactions } from './api';
import { TransactionForm } from './TransactionForm';
import { EntryHub } from '../money/EntryHub';
import { listCashMovements } from '../money/api';
import { listCreditors } from '../debts/api';
import { sumByType, TransactionList } from './TransactionList';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

type Filter = 'all' | 'income' | 'expense' | 'slip';

export function DailyPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('date') ?? todayIso();
  const selectedDate = parseIsoDate(selected);
  const [viewYear, viewMonth] = [selectedDate.getFullYear(), selectedDate.getMonth()];
  const { from, to } = monthRange(viewYear, viewMonth);

  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const month = useAsync(() => listTransactions(from, to), [from, to]);
  const lookups = useAsync(() => Promise.all([listPayees(), listCategories(), listCreditors()]), []);
  const movements = useAsync(() => listCashMovements(from, to), [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of month.data ?? []) map.set(t.txn_date, [...(map.get(t.txn_date) ?? []), t]);
    return map;
  }, [month.data]);

  const dayTxns = byDay.get(selected) ?? [];
  const visible = dayTxns.filter((t) =>
    filter === 'all' ? true : filter === 'slip' ? !!t.slip_image_path : t.type === filter,
  );
  const slipPaths = dayTxns.map((t) => t.slip_image_path).filter((p): p is string => !!p);
  const slipUrls = useAsync(() => signSlipUrls(slipPaths), [slipPaths.join('|')]);
  const dayTotals = sumByType(dayTxns);
  const monthTotals = sumByType(month.data ?? []);

  function selectDate(iso: string) {
    setParams({ date: iso });
  }
  function shiftMonth(delta: number) {
    selectDate(toIsoDate(new Date(viewYear, viewMonth + delta, 1)));
  }

  async function onDelete(t: Transaction) {
    if (!confirm('ลบรายการนี้?')) return;
    try {
      await deleteTransaction(t.id);
      if (t.slip_image_path) await removeSlipImage(t.slip_image_path);
      month.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toIsoDate(new Date(viewYear, viewMonth, i + 1))),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <button className="btn-secondary px-2 py-1" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อน">
            ‹
          </button>
          <h2 className="font-semibold">
            {new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(selectedDate)}
          </h2>
          <button className="btn-secondary px-2 py-1" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`blank-${i}`} />;
            const totals = sumByType(byDay.get(iso) ?? []);
            const isSelected = iso === selected;
            const isToday = iso === todayIso();
            return (
              <button
                key={iso}
                onClick={() => selectDate(iso)}
                className={`flex min-h-14 flex-col items-center rounded-lg p-1 text-xs ${
                  isSelected ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100'
                } ${isToday && !isSelected ? 'ring-1 ring-emerald-500' : ''}`}
              >
                <span className="font-medium">{parseIsoDate(iso).getDate()}</span>
                {totals.income > 0 && (
                  <span className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-emerald-600'}`}>
                    +{Math.round(totals.income).toLocaleString('th-TH')}
                  </span>
                )}
                {totals.expense > 0 && (
                  <span className={`text-[10px] ${isSelected ? 'text-rose-100' : 'text-rose-600'}`}>
                    −{Math.round(totals.expense).toLocaleString('th-TH')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <Stat label="รายรับเดือนนี้" value={monthTotals.income} tone="income" />
          <Stat label="รายจ่ายเดือนนี้" value={monthTotals.expense} tone="expense" />
          <Stat label="คงเหลือ" value={monthTotals.income - monthTotals.expense} tone="net" />
        </div>
        <ErrorText>{month.error}</ErrorText>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{formatThaiDate(selected, { dateStyle: 'full' })}</h2>
            <p className="text-sm">
              <span className="text-emerald-600">รับ {formatMoney(dayTotals.income)}</span>
              <span className="mx-2 text-slate-300">|</span>
              <span className="text-rose-600">จ่าย {formatMoney(dayTotals.expense)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="input w-auto py-1"
              value={selected}
              onChange={(e) => e.target.value && selectDate(e.target.value)}
              aria-label="เลือกวันที่"
            />
            <button className="btn-primary" onClick={() => setEditing('new')}>
              + เพิ่ม
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1 text-sm">
          {(
            [
              ['all', 'ทั้งหมด'],
              ['income', 'รายรับ'],
              ['expense', 'รายจ่าย'],
              ['slip', 'สลิป/QR'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 ${filter === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {filter === 'slip' ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visible.length === 0 && <p className="col-span-full py-6 text-center text-sm text-slate-400">ไม่มีสลิปในวันนี้</p>}
            {visible.map((t) => {
              const url = t.slip_image_path ? slipUrls.data?.[t.slip_image_path] : undefined;
              return (
                <button key={t.id} className="text-left" onClick={() => url && setViewing(url)}>
                  {url ? (
                    <img src={url} alt="สลิป" className="aspect-[3/5] w-full rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <div className="aspect-[3/5] w-full animate-pulse rounded-lg bg-slate-100" />
                  )}
                  <div className="mt-1 truncate text-xs">{t.payee?.name ?? '—'}</div>
                  <div className={`text-xs font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatMoney(t.amount)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <TransactionList
            transactions={visible}
            slipUrls={slipUrls.data}
            onEdit={(t) => setEditing(t)}
            onDelete={(t) => void onDelete(t)}
          />
        )}
        {(() => {
          const dayMoves = (movements.data ?? []).filter((m) => m.date === selected);
          if (dayMoves.length === 0) return null;
          return (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <h3 className="text-xs font-semibold text-slate-500">เงินเข้า-ออกอื่น (ไม่ใช่รายรับ/รายจ่าย)</h3>
              <ul className="text-sm">
                {dayMoves.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 py-1">
                    <span className="truncate text-slate-600">{m.label}</span>
                    <span className={`shrink-0 tabular-nums ${m.amount < 0 ? 'text-slate-700' : 'text-emerald-600'}`}>
                      {m.amount < 0 ? '−' : '+'}
                      {formatMoney(Math.abs(m.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
        <ErrorText>{actionError}</ErrorText>
      </section>

      {editing && (
        <Modal title={editing === 'new' ? 'บันทึกรายการ' : 'แก้ไขรายการ'} onClose={() => setEditing(null)}>
          {editing === 'new' ? (
            <EntryHub
              defaultDate={selected}
              onSaved={() => {
                setEditing(null);
                month.reload();
                movements.reload();
                lookups.reload();
              }}
            />
          ) : (
            <TransactionForm
              payees={lookups.data?.[0] ?? []}
              categories={lookups.data?.[1] ?? []}
              creditors={lookups.data?.[2] ?? []}
              initial={editing}
              defaultDate={selected}
              onSaved={() => {
                setEditing(null);
                month.reload();
                lookups.reload();
              }}
            />
          )}
        </Modal>
      )}
      {viewing && <ImageViewer src={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

