import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { listCreditors } from '../debts/api';
import { listPayees } from '../payees/api';
import { listCategories } from '../transactions/api';
import { TransactionForm } from '../transactions/TransactionForm';
import { PayDebtForm } from './PayDebtForm';
import { ReceivableForm } from './ReceivableForm';

type Tab = 'money' | 'pay' | 'people';

const TABS: { value: Tab; label: string }[] = [
  { value: 'money', label: 'รายรับ / รายจ่าย' },
  { value: 'pay', label: 'ชำระหนี้ / บัตร' },
  { value: 'people', label: 'ให้ยืม / รับคืน' },
];

/** The one place to record anything that happened with money. */
export function EntryHub({ defaultDate, onSaved }: { defaultDate?: string; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('money');
  const lookups = useAsync(() => Promise.all([listPayees(), listCategories(), listCreditors()]), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-xs sm:text-sm">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-md px-2 py-1.5 font-medium ${tab === t.value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'money' && (
        <TransactionForm
          payees={lookups.data?.[0] ?? []}
          categories={lookups.data?.[1] ?? []}
          creditors={lookups.data?.[2] ?? []}
          defaultDate={defaultDate}
          onSaved={onSaved}
        />
      )}
      {tab === 'pay' && <PayDebtForm onSaved={onSaved} />}
      {tab === 'people' && <ReceivableForm onSaved={onSaved} />}
    </div>
  );
}
