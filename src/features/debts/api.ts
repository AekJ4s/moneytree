import imageCompression from 'browser-image-compression';
import { check, supabase, unwrap } from '../../lib/supabase';
import type { Creditor, DebtPayment } from './types';

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

export async function createCreditor(input: CreditorInput): Promise<Creditor> {
  const count = unwrap(await supabase.from('creditors').select('id')).length;
  return unwrap(
    await supabase
      .from('creditors')
      .insert({ ...input, name: input.name.trim(), sort_order: count + 1 })
      .select()
      .single(),
  );
}

export async function updateCreditor(id: string, input: Partial<CreditorInput>): Promise<void> {
  check(await supabase.from('creditors').update(input.name ? { ...input, name: input.name.trim() } : input).eq('id', id));
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

// ---- payments ----

export type CreditorInput = Pick<
  Creditor,
  'name' | 'logo' | 'balance' | 'min_payment' | 'min_payment_percent' | 'balance_updated_on' | 'credit_limit' | 'statement_day' | 'due_day'
>;

/** Debt payments, newest first (optionally only from `since`). */
export async function listDebtPayments(since?: string): Promise<DebtPayment[]> {
  let q = supabase.from('debt_payments').select('*').order('paid_on', { ascending: false }).order('created_at', { ascending: false });
  if (since) q = q.gte('paid_on', since);
  const rows = unwrap(await q) as DebtPayment[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Records a payment: money leaves the account and the creditor's balance goes down (atomic). */
export async function payDebt(creditorId: string, amount: number, date: string, note: string | null): Promise<void> {
  check(await supabase.rpc('pay_debt', { p_creditor_id: creditorId, p_amount: amount, p_date: date, p_note: note }));
}

/** Undoes a payment and adds the amount back to the balance. */
export async function deleteDebtPayment(id: string): Promise<void> {
  check(await supabase.rpc('delete_debt_payment', { p_payment_id: id }));
}
