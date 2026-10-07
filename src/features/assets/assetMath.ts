import type { Asset, AssetValuation, SavingsGoal } from './types';

export interface AssetFlow {
  asset_id: string | null;
  type: 'income' | 'expense';
  amount: number;
  txn_date: string;
}

export interface AssetSummary {
  asset: Asset;
  /** Money put in minus money taken out. */
  invested: number;
  /** Latest valuation plus flows after it; equals `invested` when never valued. */
  value: number;
  gain: number;
  lastValuedOn: string | null;
  /** Progress to the asset's own target, if any (0–1+). */
  targetProgress: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const signed = (f: AssetFlow) => (f.type === 'expense' ? 1 : -1) * Number(f.amount);

export function summarizeAsset(asset: Asset, flows: AssetFlow[], valuations: AssetValuation[]): AssetSummary {
  const mine = flows.filter((f) => f.asset_id === asset.id);
  const opening = Number(asset.opening_amount ?? 0);
  const invested = round2(mine.reduce((s, f) => s + signed(f), opening));
  const latest = valuations
    .filter((v) => v.asset_id === asset.id)
    .sort((a, b) => `${b.valued_on}${b.created_at}`.localeCompare(`${a.valued_on}${a.created_at}`))[0];
  // Deposits/withdrawals after the last valuation move the value too.
  const value = latest
    ? round2(Number(latest.value) + mine.filter((f) => f.txn_date > latest.valued_on).reduce((s, f) => s + signed(f), 0))
    : invested;
  return {
    asset,
    invested,
    value,
    gain: round2(value - invested),
    lastValuedOn: latest?.valued_on ?? null,
    targetProgress: asset.target_amount ? value / Number(asset.target_amount) : null,
  };
}

export interface SavingsTotals {
  value: number;
  invested: number;
  gain: number;
  /** Savings transactions not linked to any asset (still counted as saved). */
  unassigned: number;
}

export function savingsTotals(summaries: AssetSummary[], flows: AssetFlow[]): SavingsTotals {
  const unassigned = round2(flows.filter((f) => !f.asset_id).reduce((s, f) => s + signed(f), 0));
  const value = round2(summaries.reduce((s, a) => s + a.value, 0) + unassigned);
  const invested = round2(summaries.reduce((s, a) => s + a.invested, 0) + unassigned);
  return { value, invested, gain: round2(value - invested), unassigned };
}

/** Growth stage of the money tree for a progress ratio (0 = seed … 5 = fully grown with fruit). */
export function treeStage(progress: number): number {
  const p = Math.max(0, progress);
  if (p >= 1) return 5;
  if (p >= 0.75) return 4;
  if (p >= 0.5) return 3;
  if (p >= 0.25) return 2;
  if (p > 0) return 1;
  return 0;
}

export interface GoalSummary {
  goal: SavingsGoal;
  assets: AssetSummary[];
  value: number;
  /** value ÷ target (can exceed 1). */
  progress: number;
}

export function summarizeGoals(goals: SavingsGoal[], assets: AssetSummary[]): GoalSummary[] {
  return [...goals]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((goal) => {
      const mine = assets.filter((a) => a.asset.goal_id === goal.id);
      const value = round2(mine.reduce((s, a) => s + a.value, 0));
      return { goal, assets: mine, value, progress: value / Number(goal.target_amount) };
    });
}

export type GoalCardSize = 'large' | 'medium' | 'small';

/** The home page shows at most this many goal cards. */
export const MAX_HOME_GOALS = 6;

/** Grid columns and card size for the home page, denser as the number of goals grows. */
export function goalLayout(count: number): { grid: string; size: GoalCardSize } {
  const n = Math.min(count, MAX_HOME_GOALS);
  if (n <= 1) return { grid: 'grid-cols-1', size: 'large' };
  if (n === 2) return { grid: 'grid-cols-1 sm:grid-cols-2', size: 'medium' };
  if (n === 3) return { grid: 'grid-cols-1 sm:grid-cols-3', size: 'small' };
  if (n === 4) return { grid: 'grid-cols-2', size: 'small' };
  return { grid: 'grid-cols-2 lg:grid-cols-3', size: 'small' };
}
