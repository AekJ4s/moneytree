import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { getSavingsGoal, listAssets, listSavingsFlows, listValuations, saveSavingsGoal } from './api';
import { savingsTotals, summarizeAsset, treeStage } from './assetMath';
import { MoneyTree } from './MoneyTree';

const STAGES = ['เมล็ดพันธุ์', 'ต้นกล้า', 'ต้นอ่อน', 'ต้นไม้กำลังโต', 'ต้นไม้ใหญ่', 'ต้นไม้ออกผลทองคำ 🎉'];

/** Home-page hero: the money tree, grown by savings & investments towards the goal. */
export function TreeCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const data = useAsync(() => Promise.all([listAssets(), listSavingsFlows(), listValuations(), getSavingsGoal()]), [refreshKey]);
  const [editGoal, setEditGoal] = useState(false);

  const [assets, flows, valuations, goal] = data.data ?? [[], [], [], null];
  const summaries = assets.map((a) => summarizeAsset(a, flows, valuations));
  const totals = savingsTotals(summaries, flows);
  const progress = goal ? totals.value / goal : 0;
  const stage = treeStage(progress);

  return (
    <section className="card overflow-hidden bg-gradient-to-b from-emerald-50 to-white">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
        <div className="w-full max-w-xs sm:w-1/2">
          <MoneyTree progress={progress} />
        </div>
        <div className="w-full space-y-2 text-center sm:text-left">
          <div className="text-sm font-medium text-emerald-700">{STAGES[stage]}</div>
          <div>
            <div className="text-xs text-slate-500">เงินออม + ลงทุนทั้งหมด</div>
            <div className="text-3xl font-bold tabular-nums text-amber-600">{formatMoney(totals.value)}</div>
            {totals.gain !== 0 && (
              <div className={`text-xs ${totals.gain > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totals.gain > 0 ? 'กำไร ' : 'ขาดทุน '}
                {formatMoney(Math.abs(totals.gain))} จากเงินต้น {formatMoney(totals.invested)}
              </div>
            )}
          </div>
          {goal ? (
            <div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>เป้าหมาย {formatMoney(goal)}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-amber-100">
                <div className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" style={{ width: `${Math.min(100, progress * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {progress >= 1 ? 'ถึงเป้าแล้ว! ตั้งเป้าใหม่ให้ต้นไม้โตต่อได้' : `อีก ${formatMoney(Math.max(0, goal - totals.value))} ถึงเป้า`}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">ตั้งเป้าหมายเงินออม/ลงทุน แล้วต้นไม้จะโตตามความคืบหน้า</p>
          )}
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditGoal(true)}>
              {goal ? 'แก้เป้าหมาย' : '🎯 ตั้งเป้าหมาย'}
            </button>
            <Link to="/assets" className="btn-secondary px-2 py-1 text-xs">
              🪙 ดูที่เก็บเงิน
            </Link>
          </div>
        </div>
      </div>
      <ErrorText>{data.error}</ErrorText>
      {editGoal && <GoalDialog initial={goal} onClose={() => setEditGoal(false)} onSaved={data.reload} />}
    </section>
  );
}

function GoalDialog({ initial, onClose, onSaved }: { initial: number | null; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(initial ? String(initial) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(/,/g, ''));
    if (value.trim() && !(n > 0)) return setError('เป้าหมายต้องมากกว่า 0');
    setBusy(true);
    try {
      await saveSavingsGoal(value.trim() ? n : null);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="เป้าหมายเงินออม / ลงทุน" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-600">อยากมีเงินออม + ลงทุนรวม (บาท)</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="เช่น 100000" autoFocus />
        </label>
        <p className="text-xs text-slate-500">ต้นไม้จะโตจากเมล็ด → ต้นกล้า → ต้นไม้ใหญ่ที่ออกผลทองคำเมื่อถึงเป้า</p>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>
          บันทึก
        </button>
      </form>
    </Modal>
  );
}
