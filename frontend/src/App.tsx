import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TabBar, { TabBarProps } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { AppTabContent } from './components/AppTabContent';
import { AppSectionContent } from './components/AppSectionContent';
import { EmptyStateView } from './components/EmptyStateView';
import { SidebarVisibilityButton } from './components/LayoutControls';
import { SectionPopup } from './components/SectionPopup';
import { getNavigationActions } from './components/tabbar/NavigationActions';
import ConfirmationModal from './components/ConfirmationModal';
import { useAppController } from './hooks/app/useAppController';
import { useAppLayout } from './hooks/app/useAppLayout';
import { ACPBridge } from './utils/bridge';
import { conversationKeyOf } from './types/chat';
import type { GlobalSettings } from './types/chat';

const SIDEBAR_ANIMATION_MS = 200;
/** From this content width `app-wide:` widens side padding and the chat prompt navigation. */
const WIDE_CONTENT_MIN_WIDTH_PX = 720;

function App() {
  const { isWide, isIslandsTheme, viewportWidth } = useAppLayout();
  /** Narrower windows leave no room for the section names in the section popup. */
  const compactSections = viewportWidth < 700;
  const [openInEditor, setOpenInEditor] = useState(
    () => ACPBridge.getGlobalSettingsSnapshot()?.settings?.openInEditor ?? true
  );
  const [promptNavigationHoverOnly, setPromptNavigationHoverOnly] = useState(
    () => ACPBridge.getGlobalSettingsSnapshot()?.settings?.promptNavigationHoverOnly ?? true
  );
  const [sidebarEnabled, setSidebarEnabled] = useState(
    () => ACPBridge.getGlobalSettingsSnapshot()?.settings?.sidebarEnabled ?? true
  );
  const [sidebarPosition, setSidebarPosition] = useState<GlobalSettings['sidebarPosition']>(
    () => ACPBridge.getGlobalSettingsSnapshot()?.settings?.sidebarPosition === 'right' ? 'right' : 'left'
  );
  // Nothing is shown until the saved settings arrive, so the layout does not jump from the defaults on load.
  const [settingsLoaded, setSettingsLoaded] = useState(() => ACPBridge.getGlobalSettingsSnapshot() !== undefined);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  // A narrow window starts with the sidebar hidden, so it does not cover the content.
  const [sidebarHidden, setSidebarHidden] = useState(!isWide);
  const [sidebarVisibilityAnimating, setSidebarVisibilityAnimating] = useState(false);
  const sidebarAnimationTimerRef = useRef<number>();

  const setSidebarVisibility = (hidden: boolean) => {
    window.clearTimeout(sidebarAnimationTimerRef.current);
    setSidebarVisibilityAnimating(true);
    setSidebarHidden(hidden);
    sidebarAnimationTimerRef.current = window.setTimeout(
      () => setSidebarVisibilityAnimating(false),
      SIDEBAR_ANIMATION_MS
    );
  };

  useEffect(() => () => window.clearTimeout(sidebarAnimationTimerRef.current), []);

  // Narrowing the window past the breakpoint hides the sidebar instead of laying it over the content.
  useEffect(() => {
    if (!isWide) setSidebarVisibility(true);
  }, [isWide]);

  const appContentRef = useRef<HTMLDivElement>(null);
  const [contentWide, setContentWide] = useState(false);
  useLayoutEffect(() => {
    const el = appContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContentWide(el.clientWidth >= WIDE_CONTENT_MIN_WIDTH_PX));
    observer.observe(el);
    return () => observer.disconnect();
  }, [settingsLoaded]);

  useEffect(() => {
    const applyGlobalSettings = (payload: { settings?: Partial<GlobalSettings> } | undefined) => {
      setOpenInEditor(payload?.settings?.openInEditor ?? true);
      setPromptNavigationHoverOnly(payload?.settings?.promptNavigationHoverOnly ?? true);
      const nextSidebarEnabled = payload?.settings?.sidebarEnabled ?? true;
      setSidebarEnabled(nextSidebarEnabled);
      if (!nextSidebarEnabled) setSidebarHidden(false);
      setSidebarPosition(payload?.settings?.sidebarPosition === 'right' ? 'right' : 'left');
      const contentMaxWidthPx = payload?.settings?.contentMaxWidthPx ?? 760;
      document.documentElement.style.setProperty('--app-content-max-width', contentMaxWidthPx ? `${contentMaxWidthPx}px` : 'none');
      setSettingsLoaded(true);
    };

    const cleanup = ACPBridge.onGlobalSettings((e) => {
      applyGlobalSettings(e.detail?.payload);
    });

    const requestSettings = () => ACPBridge.loadGlobalSettings();

    if (window.__settingsBridgeReady) {
      requestSettings();
    } else {
      window.addEventListener('settings-bridge-ready', requestSettings);
    }

    return () => {
      cleanup();
      window.removeEventListener('settings-bridge-ready', requestSettings);
    };
  }, []);

  const {
    chats,
    tabs,
    activeTabId,
    activeSection,
    mountedSections,
    tabUi,
    handleRenameTab,
    availableAgents,
    runnableAgents,
    agentAvailabilityResolved,
    historyList,
    historyLoaded,
    pendingAgentSwitch,
    pendingCloseTabIds,
    handleConfirmCloseTabs,
    handleCancelCloseTabs,
    pendingAgentName,
    pendingHandoffsByTab,
    handleSelectTab,
    handleReorderTabs,
    handleCloseTab,
    handleCloseAllChats,
    hasOpenConversationsForAdapter,
    handleUpdateAgent,
    defaultNewTabAgentId,
    handleNewTab,
    handleOpenHistory,
    openSection,
    closeActiveSection,
    handleUserMessageSent,
    handleAssistantActivity,
    handleAtBottomChange,
    handleCanMarkReadChange,
    handlePermissionRequestChange,
    handleProcessingChange,
    handleQueuedChange,
    requestAgentSwitch,
    handleHandoffConsumed,
    handleForkRequest,
    handleChatSessionStateChange,
    handleContinueInNewTab,
    handleContinueInCurrentConversation,
    handleCancelAgentSwitch,
  } = useAppController();

  const navigationProps: TabBarProps = {
    isIslandsTheme,
    chats,
    tabs,
    historyList,
    activeTabId,
    tabUi,
    onSelectTab: handleSelectTab,
    onReorderTabs: handleReorderTabs,
    onCloseTab: handleCloseTab,
    onCloseAllChats: handleCloseAllChats,
    onNewTab: () => handleNewTab(),
    onNewTabWithAgent: (agentId) => handleNewTab(agentId),
    onRenameTab: handleRenameTab,
    agents: availableAgents,
    noRunnableAgents: agentAvailabilityResolved && runnableAgents.length === 0,
    onOpenHistory: () => openSection('history'),
    onOpenManagement: () => openSection('management'),
    onOpenDesignSystem: () => openSection('design'),
    onOpenMcp: () => openSection('mcp'),
    onOpenCustomAcp: () => openSection('custom-acp'),
    onOpenPromptLibrary: () => openSection('prompt-library'),
    onOpenSystemInstructions: () => openSection('system-instructions'),
    onOpenSettings: () => openSection('settings'),
    sidebarPosition,
    onUseSidebar: !sidebarEnabled ? () => setSidebarLayoutEnabled(true) : undefined,
  };

  function setSidebarLayoutEnabled(enabled: boolean) {
    const settings = ACPBridge.getGlobalSettingsSnapshot()?.settings;
    setSidebarEnabled(enabled);
    setSidebarHidden(false);
    if (settings && settings.sidebarEnabled !== enabled) {
      ACPBridge.saveGlobalSettings({ ...settings, sidebarEnabled: enabled });
    }
  }

  const toggleOpenInEditor = () => {
    const settings = ACPBridge.getGlobalSettingsSnapshot()?.settings;
    if (settings) {
      ACPBridge.saveGlobalSettings({ ...settings, openInEditor: !settings.openInEditor });
    }
  };

  const toggleSidebarPosition = () => {
    const settings = ACPBridge.getGlobalSettingsSnapshot()?.settings;
    if (settings) {
      ACPBridge.saveGlobalSettings({
        ...settings,
        sidebarPosition: settings.sidebarPosition === 'right' ? 'left' : 'right',
      });
    }
  };

  if (!settingsLoaded) return <div className="h-full bg-background" />;

  return (
    <div
      className={`relative h-full min-w-[320px] bg-background text-foreground overflow-hidden flex ${sidebarEnabled ? 'flex-row' : 'flex-col'} ${!sidebarEnabled || isWide ? '[--content-top-inset:1rem]' : ''}`}
    >
      {sidebarEnabled ? (
        <Sidebar
          {...navigationProps}
          position={sidebarPosition}
          hidden={sidebarHidden}
          animateVisibility={sidebarVisibilityAnimating}
          overlay={!isWide}
          preferredWidth={sidebarWidth}
          viewportWidth={viewportWidth}
          newTabAgentId={defaultNewTabAgentId}
          onWidthChange={setSidebarWidth}
          onHide={() => setSidebarVisibility(true)}
          onUseTabBar={() => setSidebarLayoutEnabled(false)}
          openInEditor={openInEditor}
          onToggleOpenInEditor={toggleOpenInEditor}
          onTogglePosition={toggleSidebarPosition}
        />
      ) : <TabBar {...navigationProps} />}

      {sidebarEnabled && !sidebarHidden && !isWide ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-30"
          onClick={() => setSidebarVisibility(true)}
        />
      ) : null}

      {sidebarEnabled && sidebarHidden ? (
        <SidebarVisibilityButton
          position={sidebarPosition}
          hidden
          onClick={() => setSidebarVisibility(false)}
        />
      ) : null}

      <div id="app-content" ref={appContentRef} data-wide={contentWide || undefined} className="flex-1 relative min-h-0 min-w-0">
        {/* Chat tabs stay mounted so their sessions and UI state are preserved. */}
        {tabs.map((tab) => {
          const isTabActive = tab.id === activeTabId;

          return (
            <AppTabContent
              key={tab.id}
              tab={tab}
              isActive={isTabActive}
              runnableAgents={runnableAgents}
              promptNavigationHoverOnly={promptNavigationHoverOnly || !contentWide}
              pendingHandoff={pendingHandoffsByTab[tab.id]}
              onUserMessageSent={() => handleUserMessageSent(tab.id)}
              onAssistantActivity={() => handleAssistantActivity(tab.id)}
              onAtBottomChange={(isAtBottom) => handleAtBottomChange(tab.id, isAtBottom)}
              onCanMarkReadChange={(canMarkRead) => handleCanMarkReadChange(tab.id, canMarkRead)}
              onPermissionRequestChange={(hasPendingPermission) => handlePermissionRequestChange(tab.id, hasPendingPermission)}
              onProcessingChange={(isProcessing) => handleProcessingChange(tab.id, isProcessing)}
              onQueuedChange={(hasQueuedPrompts) => handleQueuedChange(tab.id, hasQueuedPrompts)}
              onAgentChangeRequest={(payload) => requestAgentSwitch(tab.id, payload)}
              onForkRequest={(payload) => handleForkRequest(tab.id, payload)}
              onHandoffConsumed={(handoffId) => handleHandoffConsumed(tab.id, handoffId)}
              onSessionStateChange={(state) => handleChatSessionStateChange(tab.id, state)}
            />
          );
        })}

        {/* Empty state */}
        {!activeTabId && (
          <EmptyStateView
            runnableAgents={runnableAgents}
            loaded={agentAvailabilityResolved && historyLoaded}
            onStartWithAgent={handleNewTab}
            onOpenManagement={() => openSection('management')}
            agents={availableAgents}
            // In the history order, pinned ones first; open chats are left out.
            recentChats={historyList
              .filter((item) => !tabs.some((tab) => conversationKeyOf(tab) === item.conversationId))
              .slice(0, 5)}
            historyCount={historyList.length}
            onOpenChat={handleOpenHistory}
            onOpenHistory={() => openSection('history')}
          />
        )}
      </div>

      {/* Sections mount on first use and remain cached without becoming tabs. */}
      <SectionPopup
        sections={getNavigationActions(navigationProps)}
        activeSection={activeSection}
        compact={compactSections}
        onClose={closeActiveSection}
      >
        {mountedSections.map((section) => (
          <AppSectionContent
            key={section}
            section={section}
            tabs={tabs}
            historyList={historyList}
            historyLoaded={historyLoaded}
            isActive={section === activeSection}
            availableAgents={availableAgents}
            hasOpenConversationsForAdapter={hasOpenConversationsForAdapter}
            onUpdateAgent={handleUpdateAgent}
            onOpenHistory={handleOpenHistory}
          />
        ))}
      </SectionPopup>

      <ConfirmationModal
        isOpen={pendingCloseTabIds !== null}
        title={pendingCloseTabIds && pendingCloseTabIds.length > 1 ? 'Close Chats' : 'Close Chat'}
        message={pendingCloseTabIds && pendingCloseTabIds.length > 1
          ? 'Some chats have unfinished prompts. Closing these chats will stop active prompts and discard all queued prompts.'
          : 'This chat has unfinished prompts. Closing it will stop any active prompt and discard all queued prompts.'}
        confirmLabel={pendingCloseTabIds && pendingCloseTabIds.length > 1 ? 'Close Chats' : 'Close Chat'}
        cancelLabel="Cancel"
        onConfirm={handleConfirmCloseTabs}
        onCancel={handleCancelCloseTabs}
      />

      <ConfirmationModal
        isOpen={pendingAgentSwitch !== null}
        title={`Switch to ${pendingAgentName}`}
        message={`Click "Continue" to pass the current chat context to ${pendingAgentName}.` + "\n" + `Click "Start New" to begin a new separate chat.`}
        confirmLabel="Continue"
        secondaryActionLabel="Start New"
        onSecondaryAction={handleContinueInNewTab}
        showCancelButton={false}
        onConfirm={handleContinueInCurrentConversation}
        onCancel={handleCancelAgentSwitch}
      />
    </div>
  );
}

export default App;
