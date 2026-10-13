import { useEffect, useMemo, useState } from 'react';
import { ACPBridge } from '../../utils/bridge';
import { formatDate } from '../../utils/formatDate';
import type { AgentOption, HistorySessionMeta } from '../../types/chat';

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
    setSelectedConversationIds((prev) => prev.filter((id) => (
      historyList.some((item) => item.conversationId === id && item.deletable !== false)
    )));
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

  const filteredHistoryList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (agentFilter === null && !query && group === null) return historyList;
    return historyList.filter((item) =>
      (agentFilter === null || getItemAgents(item).includes(agentFilter)) &&
      (group === null || (item.group ?? '') === group) &&
      item.title.toLowerCase().includes(query)
    );
  }, [historyList, agentFilter, searchQuery, group]);

  const selectedCount = selectedConversationIds.length;
  const filteredConversationIds = filteredHistoryList
    .filter((item) => item.deletable !== false)
    .map((item) => item.conversationId);
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

  return {
    isLoading,
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
  };
}
