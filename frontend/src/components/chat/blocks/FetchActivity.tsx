import React from 'react';
import { ToolCallEntry } from '../../../types/chat';
import { ActivityOutput } from './ActivityOutput';
import { ExpandableActivity } from './ExpandableActivity';
import { InlineButton } from './InlineButton';
import { parseToolStatus, safeParseJson } from '../../../utils/toolCallUtils';

interface Props {
  entry: ToolCallEntry;
  isActivePrompt: boolean;
  onOpenUrl: (url: string) => void;
}

const GlobeIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>
);

const WebSearchIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="3" y1="11" x2="19" y2="11"></line>
    <path d="M11 3a12 12 0 0 1 0 16"></path>
    <path d="M11 3a12 12 0 0 0 0 16"></path>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

function extractUrl(title: string | undefined, rawInput: Record<string, any> | undefined): string | undefined {
  const cleanTitle = title?.replace(/^"(.*)"$/, '$1') || title;
  const urlMatch = cleanTitle?.match(/https?:\/\/[^\s"']+/);
  let url = urlMatch?.[0] || rawInput?.url;
  if (url) {
    url = url.replace(/[.,"'>)]+$/, '');
  }
  return url;
}

export const FetchActivity: React.FC<Props> = ({ entry, onOpenUrl, isActivePrompt }) => {
  const parsed = safeParseJson(entry.rawJson);
  const rawInput = parsed?.rawInput;
  const cleanTitle = rawInput?.url || entry.title?.replace(/^"(.*)"$/, '$1') || entry.title;
  const url = extractUrl(entry.title, rawInput);
  const isSearch = !!rawInput?.query;
  const showPending = parseToolStatus(entry.status).isPending && isActivePrompt;

  return (
    <ExpandableActivity icon={<span className="flex-shrink-0">{isSearch ? <WebSearchIcon size={13} /> : <GlobeIcon size={13} />}</span>}
      label={url
        ? <InlineButton onClick={() => onOpenUrl(url)} className="hover:underline">{url.replace(/^https?:\/\//, '')}</InlineButton>
        : cleanTitle || entry.kind}
      status={entry.status} isActivePrompt={isActivePrompt}
    >
      <ActivityOutput
        input={<>
          <div>{isSearch ? `Web search: ${rawInput.query}` : cleanTitle}</div>
          {rawInput?.prompt && <div className="italic mt-0.5">Prompt: {rawInput.prompt}</div>}
        </>}
        result={entry.result} pendingText={showPending ? 'Fetching...' : null} />
    </ExpandableActivity>
  );
};
