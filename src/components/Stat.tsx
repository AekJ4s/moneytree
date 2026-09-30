import { formatMoney } from '../lib/format';

export function Stat({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' | 'net' }) {
  const color = tone === 'income' ? 'text-emerald-600' : tone === 'expense' ? 'text-rose-600' : value >= 0 ? 'text-slate-800' : 'text-rose-600';
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-semibold tabular-nums ${color}`}>{formatMoney(value)}</div>
    </div>
  );
}
