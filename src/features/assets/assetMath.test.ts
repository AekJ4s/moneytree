import { describe, expect, it } from 'vitest';
import { goalLayout, savingsTotals, summarizeAsset, summarizeGoals, treeStage, type AssetFlow } from './assetMath';
import type { Asset } from './types';

const dime: Asset = {
  id: 'dime', name: 'Dime', kind: 'investment', icon: '📈', target_amount: 10000, opening_amount: 0, opening_date: null, note: null, goal_id: 'house', sort_order: 0, archived: false, created_at: '',
};

const flows: AssetFlow[] = [
  { asset_id: 'dime', type: 'expense', amount: 1000, txn_date: '2026-10-01' },
  { asset_id: 'dime', type: 'expense', amount: 2000, txn_date: '2026-10-15' },
  { asset_id: 'dime', type: 'income', amount: 500, txn_date: '2026-10-20' },
  { asset_id: null, type: 'expense', amount: 300, txn_date: '2026-10-05' },
];

describe('summarizeAsset', () => {
  it('without valuations the value is what was put in', () => {
    expect(summarizeAsset(dime, flows, [])).toMatchObject({ invested: 2500, value: 2500, gain: 0, targetProgress: 0.25 });
  });

  it('uses the latest valuation plus later deposits/withdrawals', () => {
    const s = summarizeAsset(dime, flows, [
      { id: 'v1', asset_id: 'dime', value: 1100, valued_on: '2026-10-10', note: null, created_at: '' },
    ]);
    // 1,100 on 10/10, then +2,000 and −500.
    expect(s).toMatchObject({ invested: 2500, value: 2600, gain: 100, lastValuedOn: '2026-10-10' });
  });
});

describe('opening amount', () => {
  it('counts money already held as principal, not as gain', () => {
    const s = summarizeAsset({ ...dime, opening_amount: 50000, opening_date: '2026-09-30' }, flows, []);
    expect(s).toMatchObject({ invested: 52500, value: 52500, gain: 0 });
  });
  it('a later valuation shows the gain on top of it', () => {
    const s = summarizeAsset({ ...dime, opening_amount: 50000, opening_date: '2026-09-30' }, flows, [
      { id: 'v', asset_id: 'dime', value: 54000, valued_on: '2026-10-25', note: null, created_at: '' },
    ]);
    expect(s).toMatchObject({ invested: 52500, value: 54000, gain: 1500 });
  });
});

describe('savingsTotals', () => {
  it('adds savings not linked to an asset', () => {
    const s = summarizeAsset(dime, flows, []);
    expect(savingsTotals([s], flows)).toEqual({ value: 2800, invested: 2800, gain: 0, unassigned: 300 });
  });
});

describe('treeStage', () => {
  it('grows with progress', () => {
    expect([0, 0.1, 0.3, 0.6, 0.8, 1.2].map(treeStage)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('goals', () => {
  const goal = (id: string, target: number, sort_order: number) => ({ id, name: id, target_amount: target, icon: null, deadline: null, sort_order, created_at: '' });

  it('sums the assets dragged into each goal', () => {
    const dimeSummary = summarizeAsset(dime, flows, []);
    const gold = summarizeAsset({ ...dime, id: 'gold', goal_id: null }, [{ asset_id: 'gold', type: 'expense', amount: 999, txn_date: '2026-10-01' }], []);
    const [house, trip] = summarizeGoals([goal('trip', 1000, 2), goal('house', 10000, 1)], [dimeSummary, gold]);
    expect(house).toMatchObject({ value: 2500, progress: 0.25 });
    expect(trip).toMatchObject({ value: 0, progress: 0 });
  });

  it('packs more goals into denser layouts, at most six', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => goalLayout(n).size)).toEqual(['large', 'medium', 'small', 'small', 'small', 'small', 'small']);
    expect(goalLayout(4).grid).toBe('grid-cols-2');
    expect(goalLayout(9).grid).toBe(goalLayout(6).grid);
  });
});
