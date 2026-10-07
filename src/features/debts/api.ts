import imageCompression from 'browser-image-compression';
import { check, supabase, unwrap } from '../../lib/supabase';
import type { ScheduleRow } from './debtMath';
import type { Creditor, Debt, DebtEntry, DebtEntryKind, DebtInput, DebtInstallment } from './types';

export const CREDITOR_LOGO_BUCKET = 'creditor-logos';

/** Logos bundled with the app (public/creditors). */
export const CREDITOR_PRESETS: { name: string; logo: string }[] = [
  { name: 'LINE BK', logo: '/creditors/line-bk.webp' },
  { name: 'KTC', logo: '/creditors/ktc.webp' },
  { name: 'Shopee PayLater', logo: '/creditors/shopee-paylater.webp' },
  { name: 'Lazada PayLater', logo: '/creditors/lazada-paylater.webp' },
  { name: 'Central CreditCard', logo: '/creditors/central-card.webp' },
];

export function isBundledLogo(logo: string): boolean {
  return logo.startsWith('/');
}

// ---- creditors ----

export async function listCreditors(): Promise<Creditor[]> {
  return unwrap(await supabase.from('creditors').select('*').order('sort_order').order('name'));
}

export async function getCreditor(id: string): Promise<Creditor> {
  return unwrap(await supabase.from('creditors').select('*').eq('id', id).single());
}

export async function createCreditor(name: string, logo: string | null): Promise<Creditor> {
  const count = unwrap(await supabase.from('creditors').select('id')).length;
  return unwrap(
    await supabase.from('creditors').insert({ name: name.trim(), logo, sort_order: count + 1 }).select().single(),
  );
}

export async function updateCreditor(id: string, patch: Partial<Pick<Creditor, 'name' | 'logo'>>): Promise<void> {
  check(await supabase.from('creditors').update(patch).eq('id', id));
}

export async function deleteCreditor(creditor: Creditor): Promise<void> {
  check(await supabase.from('creditors').delete().eq('id', creditor.id));
  if (creditor.logo && !isBundledLogo(creditor.logo)) {
    await supabase.storage.from(CREDITOR_LOGO_BUCKET).remove([creditor.logo]);
  }
}

/** Compresses a logo to a small square-ish webp and uploads it. Returns the storage path. */
export async function uploadCreditorLogo(userId: string, file: File): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 256,
    fileType: 'image/webp',
    useWebWorker: true,
  });
  const path = `${userId}/${crypto.randomUUID()}.webp`;
  check(await supabase.storage.from(CREDITOR_LOGO_BUCKET).upload(path, compressed, { contentType: 'image/webp' }));
  return path;
}

export async function signLogoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const rows = unwrap(await supabase.storage.from(CREDITOR_LOGO_BUCKET).createSignedUrls(paths, 60 * 60 * 12));
  const out: Record<string, string> = {};
  for (const row of rows) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

// ---- debts ----

export interface DebtData {
  debts: Debt[];
  installments: DebtInstallment[];
  entries: DebtEntry[];
}

/** All debts (optionally of one creditor) with their schedules and entries. */
export async function loadDebtData(creditorId?: string): Promise<DebtData> {
  let debtQuery = supabase.from('debts').select('*').order('created_at');
  if (creditorId) debtQuery = debtQuery.eq('creditor_id', creditorId);
  const debts = unwrap(await debtQuery) as Debt[];
  const ids = debts.map((d) => d.id);
  if (ids.length === 0) return { debts, installments: [], entries: [] };
  const [installments, entries] = await Promise.all([
    supabase.from('debt_installments').select('*').in('debt_id', ids).order('seq'),
    supabase.from('debt_entries').select('*').in('debt_id', ids).order('entry_date', { ascending: false }),
  ]);
  return { debts, installments: unwrap(installments), entries: unwrap(entries) };
}

async function insertSchedule(debtId: string, rows: ScheduleRow[]): Promise<void> {
  if (rows.length === 0) return;
  check(await supabase.from('debt_installments').insert(rows.map((r) => ({ ...r, debt_id: debtId }))));
}

export async function createDebt(input: DebtInput, schedule: ScheduleRow[]): Promise<Debt> {
  const debt = unwrap(await supabase.from('debts').insert(input).select().single()) as Debt;
  try {
    await insertSchedule(debt.id, schedule);
  } catch (err) {
    // Keep data consistent: a debt without its schedule would show wrong balances.
    await supabase.from('debts').delete().eq('id', debt.id);
    throw err;
  }
  return debt;
}

export async function updateDebt(id: string, patch: Partial<DebtInput>): Promise<void> {
  check(await supabase.from('debts').update(patch).eq('id', id));
}

/** Replaces the schedule; only allowed by the UI while no installment has been paid. */
export async function replaceSchedule(debtId: string, rows: ScheduleRow[]): Promise<void> {
  check(await supabase.from('debt_installments').delete().eq('debt_id', debtId));
  await insertSchedule(debtId, rows);
}

export async function deleteDebt(id: string): Promise<void> {
  check(await supabase.from('debts').delete().eq('id', id));
}

export type InstallmentPatch = Partial<Pick<DebtInstallment, 'interest' | 'principal' | 'due_date' | 'confirmed'>>;

export async function updateInstallment(id: string, patch: InstallmentPatch): Promise<void> {
  check(await supabase.from('debt_installments').update(patch).eq('id', id));
}

/** Applies several row updates (e.g. after rebalancing a fixed-payment schedule). */
export async function updateInstallments(changes: { id: string; patch: InstallmentPatch }[]): Promise<void> {
  await Promise.all(changes.map((c) => updateInstallment(c.id, c.patch)));
}

export interface EntryInput {
  debtId: string;
  kind: DebtEntryKind;
  amount: number;
  date: string;
  note: string | null;
  installmentId: string | null;
  recordExpense: boolean;
}

export async function addDebtEntry(e: EntryInput): Promise<void> {
  check(
    await supabase.rpc('add_debt_entry', {
      p_debt_id: e.debtId,
      p_kind: e.kind,
      p_amount: e.amount,
      p_date: e.date,
      p_note: e.note,
      p_installment_id: e.installmentId,
      p_record_expense: e.recordExpense,
    }),
  );
}

export async function deleteDebtEntry(id: string): Promise<void> {
  check(await supabase.rpc('delete_debt_entry', { p_entry_id: id }));
}
