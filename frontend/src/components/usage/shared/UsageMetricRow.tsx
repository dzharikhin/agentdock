import type { ReactNode } from 'react';

import { QuotaGauge } from './QuotaGauge';
import { formatUsagePercent } from './quotaVisuals';

interface UsageMetricRowProps {
  label: string;
  percent: number | null;
  valueLabel?: string;
  meta?: ReactNode;
}

export function UsageMetricRow({
  label,
  percent,
  valueLabel,
  meta,
}: UsageMetricRowProps) {
  const resolvedValue = valueLabel ?? formatUsagePercent(percent);

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-foreground">
      <QuotaGauge percent={percent} size={22} className="self-center ml-1 mr-1" />
      <div className="flex flex-col whitespace-nowrap">
        <div className="flex items-baseline gap-x-1 whitespace-nowrap"><span>{label}:</span><span>{resolvedValue}</span></div>
        {meta ? <div className="whitespace-nowrap text-foreground-secondary">{meta}</div> : null}
      </div>
    </div>
  );
}
