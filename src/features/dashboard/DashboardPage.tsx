import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, Modal } from '../../components/Modal';
import { Stat } from '../../components/Stat';
import { formatMoney, monthRange, todayIso } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { listPayees } from '../payees/api';
import { DueRecurringList } from '../recurring/DueRecurringList';
import { signSlipUrls } from '../slips/storage';
import { listCategories, listTransactions } from '../transactions/api';
import { TransactionForm } from '../transactions/TransactionForm';
import { sumByType, TransactionList } from '../transactions/TransactionList';

export function DashboardPage() {
  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());
  const month = useAsync(() => listTransactions(from, to), [from, to]);
  const lookups = useAsync(() => Promise.all([listPayees(), listCategories()]), []);
  const [adding, setAdding] = useState(false);

  const txns = month.data ?? [];
  const totals = sumByType(txns);
  const today = txns.filter((t) => t.txn_date === todayIso());
  const todayTotals = sumByType(today);
  const recent = txns.slice(0, 10);
  const slipPaths = recent.map((t) => t.slip_image_path).filter((p): p is string => !!p);
  const slipUrls = useAsync(() => signSlipUrls(slipPaths), [slipPaths.join('|')]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txns) {
      if (t.type !== 'expense') continue;
      const key = t.category ?? t.payee?.name ?? 'ไม่ระบุ';
      map.set(key, (map.get(key) ?? 0) + Number(t.amount));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [txns]);
  const maxCategory = topCategories[0]?.[1] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(now)}
        </h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setAdding(true)}>
            + บันทึกเอง
          </button>
          <Link to="/slips" className="btn-primary">
            🧾 อัปโหลดสลิป
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="รายรับเดือนนี้" value={totals.income} tone="income" />
        <Stat label="รายจ่ายเดือนนี้" value={totals.expense} tone="expense" />
        <Stat label="คงเหลือ" value={totals.income - totals.expense} tone="net" />
      </div>
      <ErrorText>{month.error}</ErrorText>

      <DueRecurringList onChanged={month.reload} />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-semibold">รายการล่าสุด</h2>
            <Link to="/daily" className="text-sm text-emerald-700 hover:underline">
              ดูรายวัน →
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            วันนี้: รับ {formatMoney(todayTotals.income)} · จ่าย {formatMoney(todayTotals.expense)} ({today.length} รายการ)
          </p>
          <TransactionList transactions={recent} slipUrls={slipUrls.data} showDate />
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">รายจ่ายตามหมวด (เดือนนี้)</h2>
          {topCategories.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีรายจ่าย</p>}
          <ul className="space-y-2">
            {topCategories.map(([name, value]) => (
              <li key={name}>
                <div className="flex justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="tabular-nums text-slate-600">{formatMoney(value)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-rose-400" style={{ width: `${(value / maxCategory) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {adding && (
        <Modal title="เพิ่มรายการ" onClose={() => setAdding(false)}>
          <TransactionForm
            payees={lookups.data?.[0] ?? []}
            categories={lookups.data?.[1] ?? []}
            onSaved={() => {
              setAdding(false);
              month.reload();
              lookups.reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
