import { useMemo } from 'react';
import type { HistorySessionMeta } from '../types/chat';

/**
 * Maps conversationId -> history item for conversations that exist in the history index.
 * A conversation is only listed after its first prompt, so this doubles as the
 * "conversation is registered and can be renamed or pinned" signal.
 */
export function useHistoryConversationIndex(historyList: HistorySessionMeta[]): Map<string, HistorySessionMeta> {
  return useMemo(() => new Map(
    historyList
      .filter((item) => item.conversationId && item.projectPath)
      .map((item) => [item.conversationId, item] as const)
  ), [historyList]);
}
