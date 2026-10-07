import type { DragEvent } from 'react';
import { formatMoney, formatThaiDate } from '../../lib/format';
import { AssetIcon } from './AssetIcon';
import type { GoalCardSize, GoalSummary } from './assetMath';
import { TREE_VIDEO_BG, TreeVideo } from './TreeVideo';

interface Props {
  summary: GoalSummary;
  size: GoalCardSize;
  images: Record<string, string>;
  onClick?: () => void;
  /** Drop target for assets dragged onto the goal. */
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
  highlighted?: boolean;
}

/** One savings goal with its own growing tree. Larger when there are fewer goals on screen. */
export function GoalCard({ summary: s, size, images, onClick, onDragOver, onDragLeave, onDrop, highlighted }: Props) {
  const pct = Math.round(s.progress * 100);
  const remaining = Math.max(0, Number(s.goal.target_amount) - s.value);
  const large = size === 'large';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`overflow-hidden rounded-2xl shadow-sm ring-1 transition ${
        highlighted ? 'scale-[1.02] ring-2 ring-amber-500' : 'ring-slate-200'
      } ${onClick ? 'cursor-pointer hover:ring-amber-400' : ''} ${large ? 'flex flex-col items-center gap-3 p-4 sm:flex-row' : 'p-3'}`}
      style={{ background: TREE_VIDEO_BG }}
    >
      <div className={large ? 'w-full max-w-xs sm:w-1/2' : size === 'medium' ? 'mx-auto w-full max-w-[16rem]' : 'mx-auto w-full max-w-[11rem]'}>
        <TreeVideo progress={s.progress} />
      </div>
      <div className={`w-full space-y-1.5 ${large ? 'text-center sm:text-left' : 'mt-1'}`}>
        <div className={`flex items-center gap-1 font-semibold ${large ? 'justify-center text-lg sm:justify-start' : 'text-sm'}`}>
          <span>{s.goal.icon ?? '🎯'}</span>
          <span className="truncate">{s.goal.name}</span>
        </div>
        <div className={`font-bold tabular-nums text-amber-600 ${large ? 'text-3xl' : size === 'medium' ? 'text-2xl' : 'text-lg'}`}>
          {formatMoney(s.value)}
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>เป้า {formatMoney(Number(s.goal.target_amount))}</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-0.5 h-2 rounded-full bg-amber-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {s.progress >= 1 ? 'ถึงเป้าแล้ว 🎉' : `อีก ${formatMoney(remaining)}`}
            {s.goal.deadline && ` · ภายใน ${formatThaiDate(s.goal.deadline, { day: 'numeric', month: 'short', year: '2-digit' })}`}
          </div>
        </div>
        {s.assets.length > 0 ? (
          <div className={`flex flex-wrap gap-1 ${large ? 'justify-center sm:justify-start' : ''}`}>
            {s.assets.map((a) => (
              <span key={a.asset.id} className="inline-flex items-center gap-1 rounded-full bg-white/80 py-0.5 pr-2 pl-0.5 text-xs ring-1 ring-amber-200">
                <AssetIcon asset={a.asset} images={images} size="sm" />
                <span className="max-w-24 truncate">{a.asset.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">ลากที่เก็บเงินมาวางที่นี่</p>
        )}
      </div>
    </div>
  );
}
