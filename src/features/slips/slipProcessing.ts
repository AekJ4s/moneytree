import type { Payee, PayeeRule, TxnType } from '../../lib/types';
import { parseQrPayload, type PaymentQr, type SlipQr } from './emvco';
import { findRuleMatch } from './matching';
import { extractAmount, extractDate, extractTime, guessRecipient } from './slipText';

export type SlipStatus = 'queued' | 'scanning' | 'ready' | 'saving' | 'saved' | 'duplicate' | 'error';

export interface SlipDraft {
  key: string;
  file: File;
  previewUrl: string;
  status: SlipStatus;
  error: string | null;
  qrPayload: string | null;
  slipQr: SlipQr | null;
  paymentQr: PaymentQr | null;
  ocrText: string;
  keywordCandidates: string[];
  // Editable fields
  include: boolean;
  type: TxnType;
  amount: string;
  date: string;
  time: string;
  payeeName: string;
  category: string;
  note: string;
  /** How the payee was filled in automatically, if it was. */
  matchedVia: 'promptpay' | 'keyword' | null;
  /** Save a mapping rule so future slips map to this payee. */
  remember: boolean;
  /** Text from the slip used as the keyword rule (when there is no PromptPay QR). */
  keyword: string;
}

export function newDraft(file: File, defaultDate: string): SlipDraft {
  return {
    key: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: 'queued',
    error: null,
    qrPayload: null,
    slipQr: null,
    paymentQr: null,
    ocrText: '',
    keywordCandidates: [],
    include: true,
    type: 'expense',
    amount: '',
    date: defaultDate,
    time: '',
    payeeName: '',
    category: '',
    note: '',
    matchedVia: null,
    remember: true,
    keyword: '',
  };
}

export interface ScanResult {
  qrCodes: string[];
  ocrText: string;
}

/** Fills a draft from raw scan output (QR payloads + OCR text) and the saved mapping rules. */
export function applyScan(draft: SlipDraft, scan: ScanResult, rules: PayeeRule[], payees: Payee[]): SlipDraft {
  let slipQr: SlipQr | null = null;
  let paymentQr: PaymentQr | null = null;
  let qrPayload: string | null = null;
  for (const raw of scan.qrCodes) {
    const parsed = parseQrPayload(raw);
    if (parsed.kind === 'slip' && !slipQr) {
      slipQr = parsed;
      qrPayload = raw;
    } else if (parsed.kind === 'payment' && !paymentQr) {
      paymentQr = parsed;
      qrPayload ??= raw;
    }
  }
  qrPayload ??= scan.qrCodes[0] ?? null;

  const amount = paymentQr?.amount ?? extractAmount(scan.ocrText);
  const recipient = guessRecipient(scan.ocrText);
  const keywordCandidates = paymentQr?.merchantName
    ? Array.from(new Set([paymentQr.merchantName, ...recipient.candidates]))
    : recipient.candidates;

  const next: SlipDraft = {
    ...draft,
    status: 'ready',
    qrPayload,
    slipQr,
    paymentQr,
    ocrText: scan.ocrText,
    keywordCandidates,
    keyword: paymentQr?.merchantName ?? recipient.suggested ?? '',
    amount: amount ? amount.toFixed(2) : draft.amount,
    date: extractDate(scan.ocrText) ?? draft.date,
    time: extractTime(scan.ocrText) ?? draft.time,
  };
  return applyRules(next, rules, payees);
}

/** Auto-fills payee/type/category from the first matching rule. Leaves manual entries alone. */
export function applyRules(draft: SlipDraft, rules: PayeeRule[], payees: Payee[]): SlipDraft {
  if (draft.payeeName && !draft.matchedVia) return draft;
  const match = findRuleMatch(rules, {
    recipientKey: draft.paymentQr?.recipientKey ?? null,
    ocrText: draft.ocrText,
  });
  const payee = match && payees.find((p) => p.id === match.rule.payee_id);
  if (!match || !payee) return draft;
  return {
    ...draft,
    payeeName: payee.name,
    type: payee.default_type,
    category: draft.category || payee.category || '',
    matchedVia: match.via,
    remember: false,
  };
}

/** Stable identity of a slip for duplicate detection: the bank transaction reference. */
export function slipRef(draft: SlipDraft): string | null {
  return draft.slipQr?.transRef ?? null;
}
