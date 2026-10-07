import imageCompression from 'browser-image-compression';
import { SAVINGS_CATEGORIES } from '../../lib/savings';
import { check, supabase, unwrap, unwrapMaybe } from '../../lib/supabase';
import type { AssetFlow } from './assetMath';
import { CREDITOR_LOGO_BUCKET } from '../debts/api';
import type { Asset, AssetValuation } from './types';

export type AssetInput = Pick<Asset, 'name' | 'kind' | 'icon' | 'target_amount' | 'note'> &
  Partial<Pick<Asset, 'opening_amount' | 'opening_date'>>;

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

export async function getSavingsGoal(): Promise<number | null> {
  const row = unwrapMaybe(await supabase.from('user_settings').select('savings_goal').maybeSingle()) as {
    savings_goal: number | null;
  } | null;
  return row?.savings_goal != null ? Number(row.savings_goal) : null;
}

export async function saveSavingsGoal(goal: number | null): Promise<void> {
  check(
    await supabase
      .from('user_settings')
      .upsert({ savings_goal: goal, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
  );
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
