import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ToolCallBlock } from '../../../types/chat';
import { parseToolStatus } from '../../../utils/toolCallUtils';
import { EditBlock } from './EditBlock';
import { chatFocusClassName } from '../shared/focusStyles';

interface Props {
  blocks: ToolCallBlock[];
  isOpen: boolean;
}

export const EditGroup: React.FC<Props> = ({ blocks, isOpen }) => {
  const [isExpanded, setIsExpanded] = useState(isOpen);

  useEffect(() => {
    if (!isOpen) setIsExpanded(false);
  }, [isOpen]);

  const isGrouped = blocks.length > 1;
  const files = new Set(blocks.map(({ entry }) =>
    entry.locations?.[0]?.path || entry.content?.find((item) => item?.path)?.path || entry.title)).size;
  const hasError = blocks.some(({ entry }) => parseToolStatus(entry.status).isError);
  const expanded = !isGrouped || isExpanded;

  return (
    <div className="w-full min-w-0 max-w-full">
      {isGrouped && (
        <button onClick={() => setIsExpanded(v => !v)}
          className={`flex items-center gap-1.5 max-w-full text-foreground-secondary ${chatFocusClassName}`}
        >
          <span className="truncate">{`Edited ${files} ${files === 1 ? 'file' : 'files'}`}</span>
          {hasError && <span className="w-2.5 h-2.5 flex-shrink-0 rounded-full bg-error" />}
          <span className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRight size={14} />
          </span>
        </button>
      )}

      <div {...(!expanded ? { inert: '' } : {})} className={`grid px-[1px] duration-300 ease-in-out w-full min-w-0
        ${expanded ? 'opacity-100 translate-y-0 overflow-visible' : 'opacity-0 -translate-y-2 overflow-hidden'}`}
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="w-full min-w-0 min-h-0">
          <div className={`flex flex-col gap-3 ${isGrouped ? 'pt-2' : ''}`}>
            {blocks.map((block, i) => <EditBlock key={block.entry.toolCallId || i} block={block} />)}
          </div>
        </div>
      </div>
    </div>
  );
};
