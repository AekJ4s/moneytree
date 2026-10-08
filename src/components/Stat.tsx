import { formatMoney } from '../lib/format';

type Tone = 'income' | 'expense' | 'savings' | 'net';

export function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const color =
    tone === 'income'
      ? 'text-emerald-600'
      : tone === 'expense'
        ? 'text-rose-600'
        : tone === 'savings'
          ? 'text-amber-600'
          : value >= 0
            ? 'text-slate-800'
            : 'text-rose-600';
  return (
    <div className="rounded-md border border-slate-200 bg-page px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`figure font-medium ${color}`}>{formatMoney(value)}</div>
    </div>
  );
}
