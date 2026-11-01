import { formatMoney } from '../../lib/format';

/** "วงเงินคงเหลือ 84,993.38 / 162,500.00" with a usage bar. */
export function CreditBar({ limit, available }: { limit: number; available: number }) {
  const pct = limit > 0 ? Math.min(100, Math.max(0, ((limit - available) / limit) * 100)) : 0;
  return (
    <div className="mt-1">
      <div className={`text-xs ${available < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
        วงเงินคงเหลือ {formatMoney(available)} / {formatMoney(limit)}
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
