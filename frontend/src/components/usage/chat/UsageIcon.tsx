import { Tooltip } from '../../chat/shared/Tooltip';
import React from 'react';
import { QuotaGauge } from '../shared/QuotaGauge';
import { ACPBridge } from '../../../utils/bridge';

export function UsageIcon({
  children,
  percent,
  adapterId,
}: {
  children: React.ReactNode;
  percent?: number | null;
  adapterId: string;
}) {
  if (percent === null || percent === undefined) return null;

  const displayLabel = `${Math.round(percent)}%`;

  return (
    <div className="min-w-0 flex-1 max-w-max">
      <Tooltip className="h-full" content={children} onShow={() => ACPBridge.fetchAdapterUsage(adapterId)}>
        <button
          aria-label={`Usage quota: ${displayLabel} used`}
          className="flex h-full w-full min-w-0 items-center rounded border-0 bg-background-secondary px-1.5
            text-ide-small text-foreground transition-colors outline-none cursor-default hover:bg-hover
            hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground">
          <div className="flex min-w-0 items-center">
            <QuotaGauge percent={percent} />
            <span className="relative top-px ml-1 min-w-0 truncate chat-max-600:hidden">{displayLabel}</span>
            <span className="invisible w-0" aria-hidden="true">&nbsp;</span>
          </div>
        </button>
      </Tooltip>
    </div>
  );
}
