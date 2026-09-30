import type { TxnType } from '../lib/types';

export function TypeToggle({ value, onChange }: { value: TxnType; onChange: (t: TxnType) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
      {(['expense', 'income'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-md px-3 py-1 font-medium ${
            value === t ? (t === 'income' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'text-slate-600'
          }`}
        >
          {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
        </button>
      ))}
    </div>
  );
}
