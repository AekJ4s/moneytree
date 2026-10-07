import { useAsync } from '../../lib/useAsync';
import { isBundledLogo, signLogoUrls } from './api';
import type { Creditor } from './types';

const SIZE = { sm: 'h-8 w-8 text-sm', md: 'h-12 w-12 text-lg', lg: 'h-16 w-16 text-2xl' } as const;

interface Props {
  name: string;
  /** Resolved image URL, or null for the initial-letter fallback. */
  src: string | null;
  size?: keyof typeof SIZE;
}

export function CreditorLogo({ name, src, size = 'md' }: Props) {
  if (src) {
    return <img src={src} alt={name} className={`${SIZE[size]} shrink-0 rounded-xl object-cover ring-1 ring-slate-200`} />;
  }
  return (
    <div className={`${SIZE[size]} flex shrink-0 items-center justify-center rounded-xl bg-slate-200 font-semibold text-slate-600`}>
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

/** Maps creditor id -> displayable logo URL (bundled assets directly, uploads via signed URLs). */
export function useLogoUrls(creditors: Creditor[]): Record<string, string | null> {
  const uploaded = creditors.map((c) => c.logo).filter((l): l is string => !!l && !isBundledLogo(l));
  const signed = useAsync(() => signLogoUrls(uploaded), [uploaded.join('|')]);
  const out: Record<string, string | null> = {};
  for (const c of creditors) {
    if (!c.logo) out[c.id] = null;
    else if (isBundledLogo(c.logo)) out[c.id] = c.logo;
    else out[c.id] = signed.data?.[c.logo] ?? null;
  }
  return out;
}
