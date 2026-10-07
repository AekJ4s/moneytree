import { useMemo, useState } from 'react';
import { emitDataChanged } from '../../lib/events';
import { useAsync } from '../../lib/useAsync';
import { listAssets } from '../assets/api';
import { SavingsForm } from '../assets/SavingsForm';
import { listCreditors } from '../debts/api';
import { listIncomeSources } from '../income/api';
import { listPayees } from '../payees/api';
import { listRecentForQuick } from '../quick/api';
import { QuickAddBar } from '../quick/QuickAddBar';
import { buildQuickTemplates, type QuickTemplate } from '../quick/quickTemplates';
import { listCategories } from '../transactions/api';
import { TransactionForm } from '../transactions/TransactionForm';
import { PayDebtForm } from './PayDebtForm';
import { ReceivableForm } from './ReceivableForm';

type Tab = 'money' | 'save' | 'pay' | 'people';

const TABS: { value: Tab; label: string }[] = [
  { value: 'money', label: 'รายรับ / รายจ่าย' },
  { value: 'save', label: '🪙 ออม / ลงทุน' },
  { value: 'pay', label: 'ชำระหนี้ / บัตร' },
  { value: 'people', label: 'ให้ยืม / รับคืน' },
];

/** The one place to record anything that happened with money. */
export function EntryHub({ defaultDate, onSaved }: { defaultDate?: string; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('money');
  const [template, setTemplate] = useState<QuickTemplate | null>(null);
  const lookups = useAsync(
    () => Promise.all([listPayees(), listCategories(), listCreditors(), listAssets(), listIncomeSources(), listRecentForQuick()]),
    [],
  );
  const recent = lookups.data?.[5] ?? [];
  const templates = useMemo(() => buildQuickTemplates(recent), [recent]);

  /** Every save from here also refreshes whatever page is open underneath. */
  function saved() {
    emitDataChanged();
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs sm:grid-cols-4 sm:text-sm">
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
        <>
          <QuickAddBar templates={templates} date={defaultDate} onEdit={setTemplate} onSaved={onSaved} />
          <TransactionForm
            // Remount so a chosen quick template becomes the form's starting values.
            key={template?.key ?? 'blank'}
            payees={lookups.data?.[0] ?? []}
            categories={lookups.data?.[1] ?? []}
            creditors={lookups.data?.[2] ?? []}
            assets={lookups.data?.[3] ?? []}
            incomeSources={lookups.data?.[4] ?? []}
            onIncomeSourcesChanged={lookups.reload}
            template={template ?? undefined}
            recent={recent}
            defaultDate={defaultDate}
            onSaved={saved}
          />
        </>
      )}
      {tab === 'save' && <SavingsForm defaultDate={defaultDate} onSaved={saved} />}
      {tab === 'pay' && <PayDebtForm onSaved={saved} />}
      {tab === 'people' && <ReceivableForm onSaved={saved} />}
    </div>
  );
}
