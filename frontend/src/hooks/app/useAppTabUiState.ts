import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttentionLevel, TabUiFlags } from '../../types/chat';

const DEFAULT_TAB_UI: TabUiFlags = { unread: false, canMarkRead: true, warning: false, processing: false, queued: false };

export function useAppTabUiState(activeTabId: string, activeTabIdRef: MutableRefObject<string>) {
  const [tabUi, setTabUi] = useState<Record<string, TabUiFlags>>({});
  const tabUiRef = useRef(tabUi);
  const pendingPermissionRef = useRef<Record<string, boolean>>({});
  tabUiRef.current = tabUi;
  // A reply in the active chat stays unread while the tool window is hidden or the editor tab is in the background.
  const [uiVisible, setUiVisible] = useState(true);
  const uiVisibleRef = useRef(uiVisible);

  useEffect(() => {
    const onVisibility = (event: Event) => {
      const visible = (event as CustomEvent<boolean>).detail !== false;
      uiVisibleRef.current = visible;
      setUiVisible(visible);
    };
    const readVisibility = () => window.__readUiVisibility?.();
    window.addEventListener('agent-dock-ui-visibility', onVisibility);
    if (window.__settingsBridgeReady) readVisibility();
    else window.addEventListener('settings-bridge-ready', readVisibility);
    return () => {
      window.removeEventListener('agent-dock-ui-visibility', onVisibility);
      window.removeEventListener('settings-bridge-ready', readVisibility);
    };
  }, []);

  const canUserSeeResponse = useCallback((tabId: string) => {
    const isActive = tabId === activeTabIdRef.current;
    const canMarkRead = tabUiRef.current[tabId]?.canMarkRead ?? true;
    return uiVisibleRef.current && isActive && canMarkRead;
  }, [activeTabIdRef]);

  const initTabUi = useCallback((id: string) => {
    setTabUi(prev => ({ ...prev, [id]: { ...DEFAULT_TAB_UI } }));
    pendingPermissionRef.current[id] = false;
  }, []);

  const cleanupTabUiState = useCallback((id: string) => {
    setTabUi(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    delete pendingPermissionRef.current[id];
  }, []);

  const markTabReadIfAllowed = useCallback((id: string) => {
    if ((tabUi[id]?.canMarkRead ?? true)) {
      setTabUi(prev => prev[id]?.unread ? { ...prev, [id]: { ...prev[id], unread: false } } : prev);
    }
  }, [tabUi]);

  const clearTabUnread = useCallback((tabId: string) => {
    setTabUi(prev => {
      const current = prev[tabId] ?? DEFAULT_TAB_UI;
      if (prev[tabId] && !current.unread) {
        return prev;
      }
      return {
        ...prev,
        [tabId]: {
          ...current,
          unread: false,
        },
      };
    });
  }, []);

  const handleAssistantActivity = useCallback((tabId: string) => {
    setTabUi(prev => {
      const current = prev[tabId] ?? DEFAULT_TAB_UI;
      if (pendingPermissionRef.current[tabId] || current.warning) {
        return current.unread ? { ...prev, [tabId]: { ...current, unread: false } } : prev;
      }

      const isActive = tabId === activeTabIdRef.current;
      const canMarkRead = current.canMarkRead;
      const canSeeResponse = uiVisibleRef.current && isActive && canMarkRead;

      if (canSeeResponse) {
        return current.unread ? { ...prev, [tabId]: { ...current, unread: false } } : prev;
      }
      
      return current.unread ? prev : { ...prev, [tabId]: { ...current, unread: true } };
    });
  }, [activeTabIdRef]);

  const handleCanMarkReadChange = useCallback((tabId: string, canMarkRead: boolean) => {
    setTabUi(prev => {
      const current = prev[tabId] ?? DEFAULT_TAB_UI;
      const shouldClearUnread = uiVisibleRef.current && canMarkRead && tabId === activeTabIdRef.current && current.unread;
      const next = {
        ...current,
        canMarkRead,
        unread: shouldClearUnread ? false : current.unread,
      };

      if (
        current.canMarkRead === next.canMarkRead &&
        current.unread === next.unread &&
        current.warning === next.warning &&
        current.processing === next.processing
      ) {
        return prev;
      }

      return { ...prev, [tabId]: next };
    });
  }, [activeTabIdRef]);

  const handleProcessingChange = useCallback((tabId: string, isProcessing: boolean) => {
    setTabUi(prev => {
      const current = prev[tabId];
      if (!current) {
        return isProcessing
          ? { ...prev, [tabId]: { ...DEFAULT_TAB_UI, processing: true } }
          : prev;
      }
      if (current.processing === isProcessing) return prev;
      return { ...prev, [tabId]: { ...current, processing: isProcessing } };
    });
  }, []);

  const handleQueuedChange = useCallback((tabId: string, hasQueuedPrompts: boolean) => {
    setTabUi(prev => {
      const current = prev[tabId] ?? DEFAULT_TAB_UI;
      if (current.queued === hasQueuedPrompts) return prev;
      return { ...prev, [tabId]: { ...current, queued: hasQueuedPrompts } };
    });
  }, []);

  const handlePermissionRequestChange = useCallback((tabId: string, hasPendingPermission: boolean) => {
    pendingPermissionRef.current[tabId] = hasPendingPermission;
    setTabUi(prev => {
      const current = prev[tabId];
      if (!current) {
        return hasPendingPermission
          ? { ...prev, [tabId]: { ...DEFAULT_TAB_UI, warning: true } }
          : prev;
      }
      const needsUpdate = current.warning !== hasPendingPermission;
      if (!needsUpdate) return prev;
      return {
        ...prev,
        [tabId]: {
          ...current,
          unread: hasPendingPermission ? false : current.unread,
          warning: hasPendingPermission
        }
      };
    });
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    if (canUserSeeResponse(activeTabId)) {
      setTabUi(prev => prev[activeTabId]?.unread ? { ...prev, [activeTabId]: { ...prev[activeTabId], unread: false } } : prev);
    }
  }, [activeTabId, canUserSeeResponse, uiVisible]);

  // The plugin icon shows a dot while any open chat does, in the colour ChatStatusIndicator gives it.
  const attention = useMemo<AttentionLevel>(() => {
    const flags = Object.values(tabUi);
    if (flags.some((f) => f.warning)) return 'warning';
    if (flags.some((f) => f.unread && !f.processing && !f.queued)) return 'unread';
    if (flags.some((f) => f.processing)) return 'processing';
    return '';
  }, [tabUi]);

  useEffect(() => {
    const sendAttention = () => window.__setAttentionBadge?.(attention);
    // Also sent once the bridge is ready, so a reloaded page clears the dot the previous one left.
    if (window.__settingsBridgeReady) sendAttention();
    else window.addEventListener('settings-bridge-ready', sendAttention);
    return () => window.removeEventListener('settings-bridge-ready', sendAttention);
  }, [attention]);

  return {
    tabUi,
    pendingPermissionRef,
    initTabUi,
    cleanupTabUiState,
    markTabReadIfAllowed,
    clearTabUnread,
    handleAssistantActivity,
    handleCanMarkReadChange,
    handlePermissionRequestChange,
    handleProcessingChange,
    handleQueuedChange,
  };
}
