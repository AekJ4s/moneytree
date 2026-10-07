export type AssetKind = 'investment' | 'savings' | 'gold' | 'cash' | 'other';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Emoji or image path. */
  icon: string | null;
  target_amount: number | null;
  /** Money already held here before tracking started; counts as principal, not as a cash movement. */
  opening_amount: number;
  opening_date: string | null;
  note: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface AssetValuation {
  id: string;
  asset_id: string;
  value: number;
  valued_on: string;
  note: string | null;
  created_at: string;
}

export const ASSET_KINDS: Record<AssetKind, { label: string; icon: string; category: 'ลงทุน' | 'เก็บออม' }> = {
  investment: { label: 'ลงทุน (หุ้น/กองทุน)', icon: '📈', category: 'ลงทุน' },
  savings: { label: 'เงินฝาก/บัญชีออม', icon: '🏦', category: 'เก็บออม' },
  gold: { label: 'ทอง', icon: '🥇', category: 'ลงทุน' },
  cash: { label: 'เงินสด', icon: '💵', category: 'เก็บออม' },
  other: { label: 'อื่นๆ', icon: '💎', category: 'เก็บออม' },
};

/** Suggestions shown when adding an asset. */
export const ASSET_PRESETS: { name: string; kind: AssetKind; icon: string }[] = [
  { name: 'Dime', kind: 'investment', icon: '📈' },
  { name: 'ทองคำ', kind: 'gold', icon: '🥇' },
  { name: 'เงินสด', kind: 'cash', icon: '💵' },
  { name: 'เงินฝากออมทรัพย์', kind: 'savings', icon: '🏦' },
];
