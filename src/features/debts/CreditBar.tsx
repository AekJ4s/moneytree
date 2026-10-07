import { formatMoney } from '../../lib/format';
import type { CreditLine } from './debtMath';

/** "วงเงินคงเหลือ 28,816.78 / 100,000.00" with a usage bar. */
export function CreditBar({ line }: { line: CreditLine }) {
  const pct = Math.min(100, Math.max(0, line.usedRatio * 100));
  return (
    <div className="mt-1">
      <div className={`text-xs ${line.available < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
        วงเงินคงเหลือ {formatMoney(line.available)} / {formatMoney(line.limit)}
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
