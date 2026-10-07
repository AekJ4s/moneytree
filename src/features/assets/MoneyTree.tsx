import { useId } from 'react';

interface Props {
  /** Savings/investments value ÷ goal; 1 = goal reached. */
  progress: number;
}

// Leaf-cluster positions on a unit canopy (x, y in −1..1, r relative), revealed as the tree grows.
const CLUSTERS: [number, number, number][] = [
  [0, -0.2, 0.62],
  [-0.55, 0.1, 0.48],
  [0.55, 0.1, 0.48],
  [-0.3, -0.62, 0.45],
  [0.32, -0.6, 0.45],
  [-0.85, -0.25, 0.36],
  [0.85, -0.25, 0.36],
  [0, -0.9, 0.38],
  [-0.6, 0.45, 0.34],
  [0.6, 0.45, 0.34],
];

// Gold fruit positions (unit canopy), shown from halfway to the goal.
const FRUITS: [number, number][] = [
  [-0.35, -0.1],
  [0.4, -0.25],
  [0.05, 0.25],
  [-0.65, -0.4],
  [0.7, 0.2],
  [-0.15, -0.65],
  [0.3, 0.5],
  [-0.55, 0.35],
];

const GREENS = ['#16a34a', '#22c55e', '#15803d', '#4ade80'];

/** The home-page tree: grows from a seed to a fruiting tree as savings approach the goal. */
export function MoneyTree({ progress }: Props) {
  const id = useId().replace(/:/g, '');
  const p = Math.min(1, Math.max(0, progress));
  const groundY = 240;
  const trunkH = p === 0 ? 0 : 18 + 90 * Math.sqrt(p);
  const trunkW = 3 + 13 * p;
  const top = groundY - trunkH;
  const canopyR = p === 0 ? 0 : 14 + 60 * Math.sqrt(p);
  const clusters = p === 0 ? 0 : Math.max(2, Math.round(2 + p * (CLUSTERS.length - 2)));
  const fruits = p < 0.5 ? 0 : Math.round(((p - 0.5) / 0.5) * FRUITS.length);
  const sprout = p > 0 && p < 0.12;

  return (
    <svg viewBox="0 0 320 262" className="h-auto w-full max-w-sm" role="img" aria-label={`ต้นไม้เงินโตแล้ว ${Math.round(p * 100)}%`}>
      <defs>
        <radialGradient id={`sky-${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`trunk-${id}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <radialGradient id={`gold-${id}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="60%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </radialGradient>
      </defs>

      <circle cx="160" cy="130" r="125" fill={`url(#sky-${id})`} />
      <ellipse cx="160" cy={groundY + 6} rx="120" ry="14" fill="#a16207" opacity="0.18" />
      <ellipse cx="160" cy={groundY + 2} rx="90" ry="9" fill="#65a30d" opacity="0.35" />

      {p === 0 && <ellipse cx="160" cy={groundY - 2} rx="7" ry="5" fill="#92400e" />}

      {sprout && (
        <g style={{ transformOrigin: `160px ${groundY}px`, animation: 'sway 4s ease-in-out infinite' }}>
          <path d={`M160 ${groundY} Q158 ${groundY - 18} 160 ${groundY - 30}`} stroke="#15803d" strokeWidth="3" fill="none" />
          <ellipse cx="151" cy={groundY - 30} rx="9" ry="5" fill="#22c55e" transform={`rotate(-25 151 ${groundY - 30})`} />
          <ellipse cx="169" cy={groundY - 32} rx="9" ry="5" fill="#16a34a" transform={`rotate(25 169 ${groundY - 32})`} />
        </g>
      )}

      {p > 0 && !sprout && (
        <g style={{ transformOrigin: `160px ${groundY}px`, animation: 'sway 6s ease-in-out infinite' }}>
          <path
            d={`M${160 - trunkW / 2} ${groundY} C${160 - trunkW / 2} ${groundY - trunkH * 0.5}, ${160 - trunkW / 3} ${top + 10}, 160 ${top}
               C${160 + trunkW / 3} ${top + 10}, ${160 + trunkW / 2} ${groundY - trunkH * 0.5}, ${160 + trunkW / 2} ${groundY} Z`}
            fill={`url(#trunk-${id})`}
          />
          {p > 0.3 && (
            <>
              <path d={`M160 ${top + trunkH * 0.35} Q${160 - canopyR * 0.45} ${top + 4} ${160 - canopyR * 0.55} ${top - 4}`} stroke="#78350f" strokeWidth={trunkW * 0.35} fill="none" strokeLinecap="round" />
              <path d={`M160 ${top + trunkH * 0.3} Q${160 + canopyR * 0.45} ${top + 2} ${160 + canopyR * 0.55} ${top - 6}`} stroke="#78350f" strokeWidth={trunkW * 0.35} fill="none" strokeLinecap="round" />
            </>
          )}
          {CLUSTERS.slice(0, clusters).map(([x, y, r], i) => (
            <circle key={i} cx={160 + x * canopyR} cy={top - canopyR * 0.35 + y * canopyR} r={r * canopyR} fill={GREENS[i % GREENS.length]} opacity="0.92" />
          ))}
          {FRUITS.slice(0, fruits).map(([x, y], i) => (
            <g key={i}>
              <circle cx={160 + x * canopyR} cy={top - canopyR * 0.35 + y * canopyR} r={6 + 3 * p} fill={`url(#gold-${id})`} stroke="#a16207" strokeWidth="0.8" />
              <text x={160 + x * canopyR} y={top - canopyR * 0.35 + y * canopyR + 3} textAnchor="middle" fontSize={7 + 2 * p} fill="#854d0e" fontWeight="700">
                ฿
              </text>
            </g>
          ))}
        </g>
      )}
      <style>{`@keyframes sway { 0%, 100% { transform: rotate(-1.2deg); } 50% { transform: rotate(1.2deg); } }`}</style>
    </svg>
  );
}
