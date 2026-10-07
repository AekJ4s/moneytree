import { describe, expect, it } from 'vitest';
import { savingsTotals, summarizeAsset, treeStage, type AssetFlow } from './assetMath';
import type { Asset } from './types';

const dime: Asset = {
  id: 'dime', name: 'Dime', kind: 'investment', icon: '📈', target_amount: 10000, note: null, sort_order: 0, archived: false, created_at: '',
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
