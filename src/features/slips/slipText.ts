/** Pure helpers that pull structured data out of OCR'd Thai bank-slip text. */

const THAI_MONTHS: Record<string, number> = {
  มค: 1, มกราคม: 1,
  กพ: 2, กุมภาพันธ์: 2,
  มีค: 3, มีนาคม: 3,
  เมย: 4, เมษายน: 4,
  พค: 5, พฤษภาคม: 5,
  มิย: 6, มิถุนายน: 6,
  กค: 7, กรกฎาคม: 7,
  สค: 8, สิงหาคม: 8,
  กย: 9, กันยายน: 9,
  ตค: 10, ตุลาคม: 10,
  พย: 11, พฤศจิกายน: 11,
  ธค: 12, ธันวาคม: 12,
};

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Normalizes text for keyword matching: lowercase, no whitespace/punctuation. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[\s.,:;'"`()\-_/\\|]+/g, '');
}

function toGregorianYear(year: number): number {
  if (year < 100) {
    // Two-digit years on Thai slips are Buddhist Era (e.g. 69 = 2569 = 2026).
    return year + 2500 - 543;
  }
  return year > 2400 ? year - 543 : year;
}

function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Finds the first recognisable date (Thai or English month names, or dd/mm/yyyy). Returns YYYY-MM-DD. */
export function extractDate(text: string): string | null {
  const monthWord = /(\d{1,2})\s*([ก-๙a-zA-Z.\s]{2,14}?)\s*(\d{4}|\d{2})(?!\d)/g;
  for (const match of text.matchAll(monthWord)) {
    const day = Number(match[1]);
    const token = match[2].replace(/[.\s]/g, '').toLowerCase();
    const month = THAI_MONTHS[token] ?? EN_MONTHS[token.slice(0, 3)];
    if (!month) continue;
    const year = toGregorianYear(Number(match[3]));
    if (isValidDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }

  const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/g;
  for (const match of text.matchAll(numeric)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = toGregorianYear(Number(match[3]));
    if (isValidDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

/** Finds the first HH:MM(:SS) time. Returns HH:MM. */
export function extractTime(text: string): string | null {
  // "14:05", "14:05:33" or "14.05 น." — a dot separator only counts when followed by "น".
  for (const match of text.matchAll(/(?<![\d.,])(\d{1,2})([:.])(\d{2})(?::\d{2})?(\s*น)?(?![\d])/g)) {
    const [, hh, sep, mm, thaiSuffix] = match;
    const h = Number(hh);
    const m = Number(mm);
    if (h < 24 && m < 60 && (sep === ':' || thaiSuffix)) return `${pad(h)}:${pad(m)}`;
  }
  return null;
}

const AMOUNT_RE = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d])/g;
const AMOUNT_HINT = /(จำนวน|ยอด|amount|บาท|thb|฿)/i;
const FEE_HINT = /(ค่าธรรมเนียม|fee)/i;

/** Picks the transferred amount: prefers lines with amount keywords, skips fee lines and zeros. */
export function extractAmount(text: string): number | null {
  const lines = text.split(/\r?\n/);
  const candidates: { value: number; hinted: boolean }[] = [];
  lines.forEach((line, idx) => {
    if (FEE_HINT.test(line)) return;
    const context = `${lines[idx - 1] ?? ''} ${line}`;
    for (const match of line.matchAll(AMOUNT_RE)) {
      const value = Number(`${match[1].replace(/,/g, '')}.${match[2]}`);
      if (value > 0) candidates.push({ value, hinted: AMOUNT_HINT.test(context) });
    }
  });
  const hinted = candidates.find((c) => c.hinted);
  return (hinted ?? candidates[0])?.value ?? null;
}

const NOISE_WORDS = [
  'โอนเงิน', 'สำเร็จ', 'จำนวน', 'ค่าธรรมเนียม', 'เลขที่รายการ', 'รหัสอ้างอิง', 'วันที่', 'บันทึกช่วยจำ',
  'สแกนตรวจสอบ', 'ยอดคงเหลือ', 'บาท', 'transfer', 'successful', 'amount', 'fee', 'reference', 'ref',
  'transaction', 'จาก', 'ไปยัง', 'ถึง', 'ผู้รับ', 'ผู้โอน', 'ชำระเงิน', 'เติมเงิน',
];
// JS \b is ASCII-only, so use an explicit lookahead to end the Thai label.
const RECIPIENT_MARKER = /^(ไปยัง|ถึง|ผู้รับ|to)(?=[\s:]|$):?/i;

// Bank / channel names and masked account numbers ("xxx-x-x1234-x") never identify the recipient.
const BANK_LINE = /^(ธ\.|ธนาคาร|พร้อมเพย์|promptpay|k\s?plus|bank\b)/i;
const MASKED_ACCOUNT = /[x*•]{3}/i;

function isCandidateLine(line: string): boolean {
  if (BANK_LINE.test(line) || MASKED_ACCOUNT.test(line)) return false;
  const letters = line.replace(/[^ก-๙a-zA-Z]/g, '');
  const digits = line.replace(/\D/g, '');
  // Names are mostly letters; references and amounts are mostly digits.
  if (letters.length < 3 || digits.length > letters.length) return false;
  if (new RegExp(AMOUNT_RE.source).test(line)) return false;
  const lower = line.toLowerCase();
  if (NOISE_WORDS.some((w) => lower.replace(/\s/g, '') === w || lower.startsWith(w))) return false;
  if (extractDate(line)) return false;
  return true;
}

export interface RecipientGuess {
  /** Lines that could identify the recipient (for the user to choose a mapping keyword). */
  candidates: string[];
  /** Best guess among the candidates, if any. */
  suggested: string | null;
}

/**
 * Suggests which OCR line names the recipient. Slips usually list the sender first,
 * then the recipient, sometimes after a "ไปยัง/To" label.
 */
export function guessRecipient(text: string): RecipientGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates = Array.from(new Set(lines.filter(isCandidateLine)));

  for (let i = 0; i < lines.length; i += 1) {
    if (!RECIPIENT_MARKER.test(lines[i])) continue;
    const rest = lines[i].replace(RECIPIENT_MARKER, '').trim();
    if (rest && isCandidateLine(rest)) return { candidates: unique([rest, ...candidates]), suggested: rest };
    const next = lines.slice(i + 1).find(isCandidateLine);
    if (next) return { candidates, suggested: next };
  }
  return { candidates, suggested: candidates[1] ?? candidates[0] ?? null };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
