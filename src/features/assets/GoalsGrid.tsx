import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { listAssets, listGoals, listSavingsFlows, listValuations } from './api';
import { useAssetImages } from './AssetIcon';
import { goalLayout, MAX_HOME_GOALS, savingsTotals, summarizeAsset, summarizeGoals } from './assetMath';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { TREE_VIDEO_BG, TreeVideo } from './TreeVideo';

/** Home page: up to six goal trees, laid out denser as there are more of them. */
export function GoalsGrid({ refreshKey = 0 }: { refreshKey?: number }) {
  const data = useAsync(() => Promise.all([listAssets(), listSavingsFlows(), listValuations(), listGoals()]), [refreshKey]);
  const [adding, setAdding] = useState(false);

  const [assets, flows, valuations, goals] = data.data ?? [[], [], [], []];
  const images = useAssetImages(assets);
  const summaries = assets.map((a) => summarizeAsset(a, flows, valuations));
  const totals = savingsTotals(summaries, flows);
  const goalSummaries = summarizeGoals(goals, summaries);
  const shown = goalSummaries.slice(0, MAX_HOME_GOALS);
  const layout = goalLayout(shown.length);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          🌳 เป้าหมายการออม
          <span className="ml-2 text-sm font-normal text-slate-500">
            ออม+ลงทุนรวม <b className="tabular-nums text-amber-600">{formatMoney(totals.value)}</b>
          </span>
        </h2>
        <div className="flex gap-2 text-sm">
          <button className="text-amber-700 hover:underline" onClick={() => setAdding(true)}>
            + เป้าหมาย
          </button>
          <Link to="/assets" className="text-emerald-700 hover:underline">
            จัดการ{goalSummaries.length > MAX_HOME_GOALS ? ` · ดูทั้งหมด (${goalSummaries.length})` : ''} →
          </Link>
        </div>
      </div>

      {!data.loading && shown.length === 0 ? (
        <button
          className="flex w-full flex-col items-center gap-2 rounded-2xl p-4 ring-1 ring-slate-200 sm:flex-row"
          style={{ background: TREE_VIDEO_BG }}
          onClick={() => setAdding(true)}
        >
          <div className="w-full max-w-[12rem]">
            <TreeVideo progress={0} />
          </div>
          <div className="text-center sm:text-left">
            <div className="font-semibold">ปลูกต้นไม้ต้นแรก 🌱</div>
            <p className="text-sm text-slate-500">สร้างเป้าหมาย แล้วลากที่เก็บเงิน (เช่น Dime, ทอง) เข้าไป ต้นไม้จะโตตามเงินออม</p>
          </div>
        </button>
      ) : (
        <div className={`grid gap-3 ${layout.grid}`}>
          {shown.map((g) => (
            <Link key={g.goal.id} to="/assets" className="block">
              <GoalCard summary={g} size={layout.size} images={images} />
            </Link>
          ))}
        </div>
      )}
      <ErrorText>{data.error}</ErrorText>

      {adding && (
        <Modal title="เป้าหมายใหม่" onClose={() => setAdding(false)}>
          <GoalForm
            existingNames={goals.map((g) => g.name)}
            onSaved={() => {
              setAdding(false);
              data.reload();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
