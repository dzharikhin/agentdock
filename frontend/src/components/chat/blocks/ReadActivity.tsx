import React from 'react';
import { ToolCallEntry } from '../../../types/chat';
import { safeParseJson } from '../../../utils/toolCallUtils';
import { ExpandableActivity } from './ExpandableActivity';
import { InlineButton } from './InlineButton';

interface Props {
  entry: ToolCallEntry;
  isActivePrompt: boolean;
  onOpenFile: (path: string, line?: number) => void;
}

const FileIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
    <polyline points="13 2 13 9 20 9"></polyline>
  </svg>
);

function getFileName(path: string): string {
  if (!path) return '';
  return path.split(/[\\/]/).pop() || path;
}

export const ReadActivity: React.FC<Props> = ({ entry, onOpenFile, isActivePrompt }) => {
  const parsed = safeParseJson(entry.rawJson);

  const location = (entry.locations?.[0] ?? parsed?.locations?.[0]) as { path?: string; line?: number } | undefined;
  const rawInput = parsed?.rawInput;
  const filePath = location?.path ?? rawInput?.filePath ?? rawInput?.path;
  const fileName = getFileName(filePath);

  const icon = <span className="flex-shrink-0"><FileIcon size={13} /></span>;
  if (!filePath || !fileName) {
    const cleanTitle = entry.title?.replace(/^"(.*)"$/, '$1') || entry.title;
    return <ExpandableActivity icon={icon} label={cleanTitle || entry.kind} status={entry.status} isActivePrompt={isActivePrompt} />;
  }

  const limit = rawInput?.limit;
  let startLine: number | null = null;
  let endLine: number | null = null;
  if (typeof location?.line === 'number') {
    if (location.line !== 0 || (limit !== undefined && limit !== 0)) {
      startLine = location.line;
      if (limit) endLine = startLine + limit;
    }
  }
  if (startLine === null && Array.isArray(rawInput?.view_range) && rawInput.view_range.length >= 1) {
    startLine = rawInput.view_range[0] ?? null;
    endLine = rawInput.view_range[1] ?? null;
  }
  if (startLine === null && typeof rawInput?.offset === 'number') {
    startLine = rawInput.offset;
    if (limit) endLine = startLine + limit;
  }

  const lineRange = startLine !== null
    ? ` L${startLine}${endLine !== null ? `-${endLine}` : ''}`
    : '';
  const pattern = typeof rawInput?.pattern === 'string' && rawInput.pattern.trim().length > 0
    ? rawInput.pattern.trim()
    : null;

  return (
    <ExpandableActivity icon={icon} status={entry.status} isActivePrompt={isActivePrompt}
      label={<>Read <InlineButton onClick={() => onOpenFile(filePath, startLine || undefined)} className="hover:underline">
        {fileName}{lineRange}</InlineButton>{pattern ? ` | Pattern: ${pattern}` : ''}</>}
    />
  );
};
