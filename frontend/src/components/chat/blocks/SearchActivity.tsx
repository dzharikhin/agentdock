import React from 'react';
import { ToolCallEntry } from '../../../types/chat';
import { parseToolStatus, safeParseJson } from '../../../utils/toolCallUtils';
import { ActivityOutput } from './ActivityOutput';
import { ExpandableActivity } from './ExpandableActivity';

interface Props {
  entry: ToolCallEntry;
  isActivePrompt: boolean;
}

const SearchIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export const SearchActivity: React.FC<Props> = ({ entry, isActivePrompt }) => {
  const parsed = safeParseJson(entry.rawJson);
  const query = typeof parsed?.rawInput?.query === 'string' && parsed.rawInput.query.trim()
    ? parsed.rawInput.query.trim()
    : '';
  const pattern = typeof parsed.rawInput?.pattern === 'string' ? parsed.rawInput.pattern.trim() : '';
  const path = typeof parsed.rawInput?.path === 'string' ? parsed.rawInput.path.trim() : '';
  const cleanTitle = entry.title?.replace(/^"(.*)"$/, '$1') || entry.title;
  const query2 = path && pattern ? `${path} | ${pattern}` : '';
  const fullText = query || query2 || pattern || cleanTitle || entry.kind;
  const searchText = query || pattern;
  const description = searchText ? [searchText, path].filter(Boolean).join(' | ') : cleanTitle || entry.kind;
  const showPending = parseToolStatus(entry.status).isPending && isActivePrompt;

  return (
    <ExpandableActivity icon={<span className="flex-shrink-0 relative top-[1px]"><SearchIcon size={13} /></span>}
      label={description} status={entry.status} isActivePrompt={isActivePrompt}
    >
      <ActivityOutput input={`Search: ${fullText}`} result={entry.result} pendingText={showPending ? 'Searching...' : null} />
    </ExpandableActivity>
  );
};
