const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: number): string {
  return moneyFmt.format(value);
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-night entries land on the right day). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatThaiDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat('th-TH', opts).format(parseIsoDate(iso));
}

export function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(year, monthIndex, 1)),
    to: toIsoDate(new Date(year, monthIndex + 1, 0)),
  };
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
