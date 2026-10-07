import imageCompression from 'browser-image-compression';
import { SAVINGS_CATEGORIES } from '../../lib/savings';
import { check, supabase, unwrap } from '../../lib/supabase';
import type { AssetFlow } from './assetMath';
import { CREDITOR_LOGO_BUCKET } from '../debts/api';
import type { Asset, AssetValuation, SavingsGoal } from './types';

export type AssetInput = Pick<Asset, 'name' | 'kind' | 'icon' | 'target_amount' | 'note'> &
  Partial<Pick<Asset, 'opening_amount' | 'opening_date' | 'goal_id'>>;

export async function listAssets(): Promise<Asset[]> {
  return unwrap(await supabase.from('assets').select('*').eq('archived', false).order('sort_order').order('created_at'));
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  return unwrap(await supabase.from('assets').insert({ ...input, name: input.name.trim() }).select().single());
}

export async function updateAsset(id: string, patch: Partial<AssetInput & { archived: boolean }>): Promise<void> {
  check(await supabase.from('assets').update(patch).eq('id', id));
}

export async function deleteAsset(id: string): Promise<void> {
  check(await supabase.from('assets').delete().eq('id', id));
}

export async function listValuations(): Promise<AssetValuation[]> {
  return unwrap(await supabase.from('asset_valuations').select('*').order('valued_on', { ascending: false }));
}

export async function addValuation(assetId: string, value: number, date: string, note: string | null): Promise<void> {
  check(await supabase.from('asset_valuations').insert({ asset_id: assetId, value, valued_on: date, note }));
}

export async function deleteValuation(id: string): Promise<void> {
  check(await supabase.from('asset_valuations').delete().eq('id', id));
}

export interface SavingsTxn extends AssetFlow {
  id: string;
  category: string | null;
  note: string | null;
}

/** Every savings/investment movement (linked to an asset, or in a savings category). */
export async function listSavingsFlows(): Promise<SavingsTxn[]> {
  const categories = SAVINGS_CATEGORIES.map((c) => `"${c}"`).join(',');
  const rows = unwrap(
    await supabase
      .from('transactions')
      .select('id, type, amount, txn_date, asset_id, category, note')
      .or(`asset_id.not.is.null,category.in.(${categories})`)
      .order('txn_date', { ascending: false }),
  ) as SavingsTxn[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export type GoalInput = Pick<SavingsGoal, 'name' | 'target_amount' | 'icon' | 'deadline'>;

export async function listGoals(): Promise<SavingsGoal[]> {
  return unwrap(await supabase.from('savings_goals').select('*').order('sort_order').order('created_at'));
}

export async function createGoal(input: GoalInput): Promise<SavingsGoal> {
  const count = unwrap(await supabase.from('savings_goals').select('id')).length;
  return unwrap(
    await supabase.from('savings_goals').insert({ ...input, name: input.name.trim(), sort_order: count + 1 }).select().single(),
  );
}

export async function updateGoal(id: string, patch: Partial<GoalInput & { sort_order: number }>): Promise<void> {
  check(await supabase.from('savings_goals').update(patch).eq('id', id));
}

/** Deleting a goal keeps its assets; they just stop counting towards any goal. */
export async function deleteGoal(id: string): Promise<void> {
  check(await supabase.from('savings_goals').delete().eq('id', id));
}

/** Puts an asset into a goal (or takes it out with null). */
export async function assignAssetToGoal(assetId: string, goalId: string | null): Promise<void> {
  check(await supabase.from('assets').update({ goal_id: goalId }).eq('id', assetId));
}

/** Compresses an asset picture and stores it privately; returns the storage path to keep in `icon`. */
export async function uploadAssetImage(userId: string, file: File): Promise<string> {
  const compressed = await imageCompression(file, { maxSizeMB: 0.1, maxWidthOrHeight: 256, fileType: 'image/webp', useWebWorker: true });
  const path = `${userId}/assets/${crypto.randomUUID()}.webp`;
  check(await supabase.storage.from(CREDITOR_LOGO_BUCKET).upload(path, compressed, { contentType: 'image/webp' }));
  return path;
}

/**
 * Moves savings between places (null = the main wallet of unassigned savings) via move_savings(),
 * which records a withdrawal and a deposit atomically — cash-neutral and outside income/expense.
 */
export async function moveSavings(input: { from: Asset | null; to: Asset; amount: number; date: string; note?: string | null }): Promise<void> {
  check(
    await supabase.rpc('move_savings', {
      p_from: input.from?.id ?? null,
      p_to: input.to.id,
      p_amount: input.amount,
      p_date: input.date,
      p_note: input.note ?? null,
    }),
  );
}
