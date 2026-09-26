import { clampPercent, getUsageSeverity } from './quotaVisuals';

const gaugePath = 'M4.5 14.062 A7 7 0 1 1 11.5 14.062';

export function QuotaGauge({ percent, size = 15, className = '' }: {
  percent?: number | null;
  size?: number;
  className?: string;
}) {
  const normalizedPercent = clampPercent(percent) ?? 0;
  const needleAngle = (120 + normalizedPercent * 3) * Math.PI / 180;
  const needleX = 8 + 7 * Math.cos(needleAngle);
  const needleY = 8 + 7 * Math.sin(needleAngle);
  const gapStart = Math.max(0, normalizedPercent - 7);
  const gapEnd = Math.min(100, normalizedPercent + 7);
  const severity = getUsageSeverity(percent);
  const color = severity === 'critical' ? 'text-error' : severity === 'warning' ? 'text-warning' : 'text-foreground';

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={`shrink-0 ${className}`} aria-hidden="true">
      {gapEnd < 100 && (
        <path d={gaugePath} pathLength={100} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={`${100 - gapEnd} 100`} strokeDashoffset={-gapEnd} className="text-foreground opacity-30" />
      )}
      {gapStart > 0 && (
        <path d={gaugePath} pathLength={100} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={`${gapStart} 100`} className={color} />
      )}
      <g className={color}>
        <line x1="8" y1="8" x2={needleX} y2={needleY} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      </g>
    </svg>
  );
}
