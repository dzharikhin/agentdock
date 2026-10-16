import { useEffect, useMemo, useRef, useState } from 'react';
import { ACPBridge } from '../../utils/bridge';
import { formatDate } from '../../utils/formatDate';
import type { AgentOption, HistorySessionMeta } from '../../types/chat';

const MIN_TEXT_QUERY_LENGTH = 3;
/** Keeps the text search fast however long the history is; older conversations match only by title. */
const TEXT_SEARCH_CONVERSATIONS = 200;
const TEXT_SEARCH_DELAY_MS = 200;

/** A finished text search: the conversations it covered, and the snippets of those with a match. */
interface TextSearch {
  query: string;
  searched: Set<string>;
  snippets: Record<string, string>;
}

function getItemAgents(item: HistorySessionMeta): string[] {
  return item.allAdapterNames && item.allAdapterNames.length > 0
    ? item.allAdapterNames
    : [item.adapterName];
}

function formatConversationLength(promptCount?: number) {
  if (promptCount == null || promptCount <= 0) return null;
  return `${promptCount} prompt${promptCount === 1 ? '' : 's'}`;
}

export function useHistoryPanelController(
  availableAgents: AgentOption[],
  isActive: boolean,
  historyList: HistorySessionMeta[],
  historyLoaded: boolean,
  /** Lists only the group's conversations; `''` the ungrouped ones, `null` all. */
  group: string | null
) {
  const [isLoading, setIsLoading] = useState(!historyLoaded);
  /** Rows show checkboxes. */
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteProjectPath, setDeleteProjectPath] = useState<string>('');
  const [agent, setAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubDeleteResult = ACPBridge.onHistoryDeleteResult((e) => {
      const result = e.detail.result;
      const failures = Array.isArray(result.failures) ? result.failures : [];
      setDeleteErrors((prev) => {
        const next = { ...prev };
        (result.requestedConversationIds || []).forEach((conversationId) => {
          delete next[conversationId];
        });
        failures.forEach((failure) => {
          if (failure?.conversationId && failure?.message) {
            next[failure.conversationId] = failure.message;
          }
        });
        return next;
      });
      setIsDeleting(false);
    });

    return () => {
      unsubDeleteResult();
    };
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    setSelectedConversationIds((prev) => prev.filter((id) => historyList.some((item) => item.conversationId === id)));
    setDeleteErrors((prev) => Object.fromEntries(
      Object.entries(prev).filter(([conversationId]) => (
        historyList.some((item) => item.conversationId === conversationId)
      ))
    ));
    setIsLoading(false);
  }, [historyList, historyLoaded]);

  useEffect(() => {
    if (!isActive) return;

    ACPBridge.requestHistoryList();
    const intervalId = window.setInterval(() => {
      ACPBridge.requestHistoryList();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [isActive]);

  const adapterDisplay = useMemo(() => {
    const map = new Map<string, AgentOption>();
    availableAgents.forEach((a) => map.set(a.id, a));
    return map;
  }, [availableAgents]);

  const uniqueAgentsInHistory = useMemo(() => {
    const agentIds = new Set<string>();
    historyList.forEach((item) => {
      getItemAgents(item).forEach((agentId) => agentIds.add(agentId));
    });
    return Array.from(agentIds);
  }, [historyList]);

  // All, once the agent is gone or the only one; the filter offers the agents only then.
  const agentFilter = uniqueAgentsInHistory.length > 1 && agent !== null && uniqueAgentsInHistory.includes(agent)
    ? agent
    : null;

  const { titleMatches, otherItems } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const items = agentFilter === null && group === null ? historyList : historyList.filter((item) =>
      (agentFilter === null || getItemAgents(item).includes(agentFilter)) &&
      (group === null || (item.group ?? '') === group)
    );
    if (!query) return { titleMatches: items, otherItems: [] };
    const matches = (item: HistorySessionMeta) => item.title.toLowerCase().includes(query);
    return { titleMatches: items.filter(matches), otherItems: items.filter((item) => !matches(item)) };
  }, [historyList, agentFilter, searchQuery, group]);

  // After a pause in the typing, searches the text of the most recent conversations without a title match;
  // its matches follow the title matches.
  const textQuery = searchQuery.trim().replace(/\s+/g, ' ');
  const tooShort = textQuery.length < MIN_TEXT_QUERY_LENGTH;
  const candidateIds = tooShort
    ? []
    : otherItems.slice(0, TEXT_SEARCH_CONVERSATIONS).map((item) => item.conversationId);
  const textQueryRef = useRef(textQuery);
  textQueryRef.current = textQuery;
  const sentSearchRef = useRef<{ query: string; searched: Set<string> } | null>(null);
  const [textSearch, setTextSearch] = useState<TextSearch | null>(null);

  // Matches start a word, so a longer query can match only where its beginning did; besides those conversations,
  // only the ones not searched yet need a search.
  const previous = textSearch && textQuery.startsWith(textSearch.query) ? textSearch : null;
  const pendingIds = candidateIds.filter((id) =>
    !previous?.searched.has(id) || (previous.query !== textQuery && id in previous.snippets));
  const isTextSearching = pendingIds.length > 0;
  // While searching, the last matches stay listed, so the list does not flicker.
  const snippets = candidateIds.length === 0 ? null
    : isTextSearching ? textSearch?.snippets ?? null
    : previous!.query === textQuery ? previous!.snippets : {};

  // A new search starts afresh, so it finds what the conversations gained since.
  useEffect(() => {
    if (tooShort) setTextSearch(null);
  }, [tooShort]);

  useEffect(() => ACPBridge.onHistorySearchResult((e) => {
    const { query, snippets: found } = e.detail.result;
    const sent = sentSearchRef.current;
    if (query !== textQueryRef.current || query !== sent?.query) return;
    // Searching the new candidates of the same query keeps its earlier matches.
    setTextSearch((prev) => ({
      query,
      searched: sent.searched,
      snippets: prev?.query === query ? { ...prev.snippets, ...found } : found,
    }));
  }), []);

  const projectPath = historyList[0]?.projectPath ?? '';
  const candidateKey = candidateIds.join('\n');
  const pendingKey = pendingIds.join('\n');
  useEffect(() => {
    if (!pendingKey) return;
    const timer = window.setTimeout(() => {
      sentSearchRef.current = { query: textQuery, searched: new Set(candidateKey.split('\n')) };
      ACPBridge.searchHistoryConversations(projectPath, pendingKey.split('\n'), textQuery);
    }, TEXT_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [projectPath, candidateKey, pendingKey, textQuery]);

  const filteredHistoryList = useMemo(
    () => snippets ? [...titleMatches, ...otherItems.filter((item) => snippets[item.conversationId])] : titleMatches,
    [titleMatches, otherItems, snippets]
  );
  // Updated once the search finishes, so the count does not flicker.
  const resultCountRef = useRef(filteredHistoryList.length);
  if (!isTextSearching) resultCountRef.current = filteredHistoryList.length;
  const resultCount = resultCountRef.current;

  const selectedCount = selectedConversationIds.length;
  const filteredConversationIds = filteredHistoryList.map((item) => item.conversationId);
  const areAllFilteredSelected = filteredConversationIds.length > 0 &&
    filteredConversationIds.every((conversationId) => selectedConversationIds.includes(conversationId));

  const toggleSelection = (conversationId: string) => {
    setSelectedConversationIds((prev) =>
      prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : [...prev, conversationId]
    );
  };

  const confirmDelete = () => {
    if (pendingDeleteIds.length === 0 || !deleteProjectPath) return;
    const deleteIds = [...pendingDeleteIds];
    setIsDeleting(true);
    setDeleteErrors((prev) => {
      const next = { ...prev };
      deleteIds.forEach((conversationId) => {
        delete next[conversationId];
      });
      return next;
    });
    ACPBridge.deleteHistoryConversations(deleteProjectPath, deleteIds);
    setPendingDeleteIds([]);
    setDeleteProjectPath('');
    setSelectedConversationIds((prev) => prev.filter((id) => !deleteIds.includes(id)));
  };

  const refreshHistory = () => {
    setIsLoading(true);
    setDeleteErrors({});
    ACPBridge.syncHistoryList();
  };

  const toggleSelectAllFiltered = () => {
    if (filteredConversationIds.length === 0) return;
    setSelectedConversationIds((prev) => {
      if (areAllFilteredSelected) {
        return prev.filter((conversationId) => !filteredConversationIds.includes(conversationId));
      }

      const next = new Set(prev);
      filteredConversationIds.forEach((conversationId) => next.add(conversationId));
      return Array.from(next);
    });
  };

  const openDeleteConfirmation = (items: HistorySessionMeta[]) => {
    const deletableItems = items.filter((item) => item.deletable !== false);
    if (deletableItems.length === 0) return;
    setPendingDeleteIds(deletableItems.map((item) => item.conversationId));
    setDeleteProjectPath(deletableItems[0].projectPath);
  };

  const cancelDelete = () => {
    setPendingDeleteIds([]);
    setDeleteProjectPath('');
  };

  const stopSelecting = () => {
    setIsSelecting(false);
    setSelectedConversationIds([]);
  };

  return {
    isLoading,
    isSelecting,
    selectedConversationIds,
    pendingDeleteIds,
    agent: agentFilter,
    searchQuery,
    editingId,
    isDeleting,
    deleteErrors,
    adapterDisplay,
    uniqueAgentsInHistory,
    filteredHistoryList,
    snippets,
    isTextSearching,
    resultCount,
    selectedCount,
    filteredConversationIds,
    areAllFilteredSelected,
    formatDate,
    formatConversationLength,
    setAgent,
    setSearchQuery,
    setEditingId,
    confirmDelete,
    refreshHistory,
    toggleSelectAllFiltered,
    openDeleteConfirmation,
    toggleSelection,
    cancelDelete,
    startSelecting: () => setIsSelecting(true),
    stopSelecting,
  };
}
