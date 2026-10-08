/** Money Tree logo and mascot, drawn from the brand board so they stay sharp at any size. */

const GROVE = '#12B886';
const NAVY = '#0B1F33';

/** Three rising bars with a leaf sprouting from the tallest. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill={GROVE}>
        <rect x="3" y="18" width="6" height="12" rx="1.6" />
        <rect x="11" y="13" width="6" height="17" rx="1.6" />
        <rect x="19" y="9" width="6" height="21" rx="1.6" />
        <path d="M20.6 8.4C19.9 3.6 23.6.6 30.5.3c.3 5.6-3.4 8.5-9.9 8.1Z" />
      </g>
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-8 w-8" />
      <span className="text-xl font-bold tracking-tight text-slate-900">Money Tree</span>
    </span>
  );
}

/** The bar-chart character: three bars for a body, a leaf on top, and a small smile. */
export function Mascot({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-4 0 124 214" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id="mascot-leaf" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0FA477" />
          <stop offset="1" stopColor="#6BD27E" />
        </linearGradient>
        <linearGradient id="mascot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2CC38E" />
          <stop offset="1" stopColor={GROVE} />
        </linearGradient>
      </defs>
      <ellipse cx="58" cy="207" rx="44" ry="3.5" fill={NAVY} opacity="0.08" />
      <rect x="38" y="180" width="13" height="27" rx="6.5" fill={NAVY} />
      <rect x="67" y="180" width="13" height="27" rx="6.5" fill={NAVY} />
      <rect x="1" y="97" width="35" height="89" rx="8" fill="#3DC79A" />
      <rect x="34" y="76" width="36" height="110" rx="8" fill="url(#mascot-body)" />
      <rect x="68" y="58" width="35" height="128" rx="8" fill={GROVE} />
      <path d="M51 68C44 40 66 10 113 3c3 27-13 55-59 61Z" fill="url(#mascot-leaf)" />
      <path d="M53 64C68 42 86 24 107 11M68 47c9-4 18-6 28-6" stroke="#0B8E66" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <circle cx="52" cy="113" r="6.5" fill={NAVY} />
      <circle cx="85" cy="113" r="6.5" fill={NAVY} />
      <circle cx="54" cy="110.6" r="2" fill="#fff" />
      <circle cx="87" cy="110.6" r="2" fill="#fff" />
      <path d="M61 122.5c4.5 5.5 11 5.5 15.5 0" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
