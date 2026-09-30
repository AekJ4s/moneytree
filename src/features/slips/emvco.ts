/**
 * Parsers for the two kinds of QR codes a Thai bank slip image can contain:
 *
 * 1. Slip-verification "mini QR" (Bank of Thailand spec) printed on e-slips.
 *    Top-level tag 00 holds sub-tags: 00 = API id ("000001"), 01 = sending bank code,
 *    02 = transaction reference. It identifies the transfer, not the recipient.
 * 2. Thai QR Payment / PromptPay (EMVCo merchant-presented) — the static QR a shop shows.
 *    Tag 29 = PromptPay credit transfer, tag 30 = bill payment, 59 = merchant name,
 *    54 = amount. These identify the recipient, so they are ideal mapping keys.
 */

export interface TlvField {
  tag: string;
  value: string;
}

/** Parses an EMVCo TLV string ("TTLLvalue..."). Returns null when the data is malformed. */
export function parseTlv(data: string): TlvField[] | null {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < data.length) {
    if (i + 4 > data.length) return null;
    const tag = data.slice(i, i + 2);
    const len = Number(data.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) return null;
    const value = data.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    fields.push({ tag, value });
    i += 4 + len;
  }
  return fields;
}

function toMap(fields: TlvField[]): Map<string, string> {
  return new Map(fields.map((f) => [f.tag, f.value]));
}

export interface SlipQr {
  kind: 'slip';
  bankCode: string;
  transRef: string;
}

export interface PaymentQr {
  kind: 'payment';
  /** Stable identifier of the recipient, used as a mapping key. */
  recipientKey: string;
  merchantName: string | null;
  amount: number | null;
}

export interface UnknownQr {
  kind: 'unknown';
}

export type ParsedQr = SlipQr | PaymentQr | UnknownQr;

/** Thai bank codes (BOT) for the banks that issue slip QR codes. */
export const BANK_NAMES: Record<string, string> = {
  '002': 'กรุงเทพ',
  '004': 'กสิกรไทย',
  '006': 'กรุงไทย',
  '011': 'ทหารไทยธนชาต',
  '014': 'ไทยพาณิชย์',
  '022': 'ซีไอเอ็มบี',
  '024': 'ยูโอบี',
  '025': 'กรุงศรี',
  '030': 'ออมสิน',
  '033': 'อาคารสงเคราะห์',
  '034': 'ธ.ก.ส.',
  '066': 'อิสลาม',
  '067': 'ทิสโก้',
  '069': 'เกียรตินาคินภัทร',
  '070': 'ไอซีบีซี',
  '071': 'ไทยเครดิต',
  '073': 'แลนด์ แอนด์ เฮ้าส์',
};

const PROMPTPAY_TAGS = ['29', '30'];

export function parseQrPayload(raw: string): ParsedQr {
  const payload = raw.trim();
  const fields = parseTlv(payload);
  if (!fields) return { kind: 'unknown' };
  const top = toMap(fields);

  const tag00 = top.get('00');
  // Payment QRs start with the payload format indicator "01" (length 2);
  // slip mini-QRs put a nested template in tag 00 instead.
  if (tag00 && tag00.length > 2) {
    const inner = parseTlv(tag00);
    if (!inner) return { kind: 'unknown' };
    const sub = toMap(inner);
    const bankCode = sub.get('01');
    const transRef = sub.get('02');
    if (bankCode && transRef) return { kind: 'slip', bankCode, transRef };
    return { kind: 'unknown' };
  }

  const merchantName = top.get('59')?.trim() || null;
  const amountRaw = top.get('54');
  const amount = amountRaw && !Number.isNaN(Number(amountRaw)) ? Number(amountRaw) : null;

  // Prefer PromptPay templates, then any other merchant account template (26–51).
  const accountTags = [
    ...PROMPTPAY_TAGS,
    ...Array.from({ length: 26 }, (_, n) => String(26 + n)).filter((t) => !PROMPTPAY_TAGS.includes(t)),
  ];
  for (const tag of accountTags) {
    const template = top.get(tag);
    if (!template) continue;
    const inner = parseTlv(template);
    if (!inner) continue;
    // Sub-tag 00 is the application id; the remaining sub-tags identify the account
    // (phone / national id / e-wallet for tag 29, biller id + ref1 for tag 30).
    const parts = inner
      .filter((f) => f.tag !== '00' && !(tag === '30' && f.tag === '03'))
      .map((f) => `${f.tag}=${f.value}`);
    if (parts.length === 0) continue;
    return { kind: 'payment', recipientKey: `${tag}:${parts.join('|')}`, merchantName, amount };
  }

  return { kind: 'unknown' };
}
