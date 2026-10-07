import React, { ReactNode, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { chatFocusClassName } from '../shared/focusStyles';
import { ToolActivityStatus } from './ToolActivityStatus';

interface Props {
  icon: ReactNode;
  label: ReactNode;
  status?: string;
  isActivePrompt?: boolean;
  // Row content after the label that is never truncated.
  trailing?: ReactNode;
  // Panel content shown on expand; the row is not expandable without it.
  children?: ReactNode;
  panelClassName?: string;
}

export const ExpandableActivity: React.FC<Props> = ({
  icon, label, status, isActivePrompt = false, trailing, children,
  panelClassName = 'p-3 bg-background-secondary text-ide-small text-editor-fg [&_.markdown-body]:my-0 max-h-[350px] '
    + 'overflow-y-auto scrollbar-thin scrollbar-thumb scrollbar-track-transparent',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // Panel content is mounted on first expand and kept afterwards, so collapsed rows stay cheap.
  const [wasExpanded, setWasExpanded] = useState(false);

  return (
    <div className="w-full min-w-0">
      <button onClick={children ? () => { setIsExpanded(v => !v); setWasExpanded(true); } : undefined}
        className={`group flex items-center gap-1.5 max-w-full min-w-0 pr-2 text-foreground-secondary ${chatFocusClassName}
          ${children ? '' : 'cursor-default'}`}
      >
        {icon}
        <span className="truncate min-w-0">{label}</span>
        {trailing}
        <ToolActivityStatus status={status} isActivePrompt={isActivePrompt} />
        {children && (
          <ChevronRight size={13} className={`flex-shrink-0 transition-transform duration-200
            ${isExpanded ? 'rotate-90' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`} />
        )}
      </button>

      {children && (
        <div {...(!isExpanded ? { inert: '' } : {})} className="grid transition-[grid-template-rows] duration-300 ease-in-out overflow-hidden"
          style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            <div tabIndex={-1} className={`mt-1.5 border border-border rounded-[6px] ${panelClassName}`}>
              {wasExpanded && children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
