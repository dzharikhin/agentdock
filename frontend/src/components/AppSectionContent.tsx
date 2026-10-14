import type { AgentOption, ChatTab, HistorySessionMeta, SectionType, TabUiFlags } from '../types/chat';
import { AgentManagementView } from './AgentManagement';
import { DesignSystemView } from './DesignSystem';
import HistoryPanel from './HistoryPanel';
import { McpServersView } from './McpServersView';
import { CustomAcpView } from './CustomAcpView';
import { PromptLibraryView } from './PromptLibraryView';
import { SectionFrame } from './SectionPopup';
import { SettingsView } from './SettingsView';
import { SystemInstructionsView } from './SystemInstructionsView';

interface AppSectionContentProps {
  section: SectionType;
  isActive: boolean;
  availableAgents: AgentOption[];
  tabs: ChatTab[];
  tabUi: Record<string, TabUiFlags>;
  historyList: HistorySessionMeta[];
  historyLoaded: boolean;
  historyGroup: string | null;
  onHistoryGroupChange: (group: string | null) => void;
  hasOpenConversationsForAdapter: (adapterId: string) => boolean;
  onUpdateAgent: (adapterId: string) => void;
  onOpenHistory: Parameters<typeof HistoryPanel>[0]['onOpenSession'];
}

export function AppSectionContent({
  section,
  isActive,
  availableAgents,
  tabs,
  tabUi,
  historyList,
  historyLoaded,
  historyGroup,
  onHistoryGroupChange,
  hasOpenConversationsForAdapter,
  onUpdateAgent,
  onOpenHistory,
}: AppSectionContentProps) {
  return (
    <SectionFrame hidden={!isActive}>
      {section === 'management' && (
        <AgentManagementView
          initialAgents={availableAgents}
          isActive={isActive}
          hasOpenConversationsForAdapter={hasOpenConversationsForAdapter}
          onUpdateAgent={onUpdateAgent}
        />
      )}
      {section === 'design' && <DesignSystemView />}
      {(section === 'history' || section === 'archive') && (
        <HistoryPanel
          availableAgents={availableAgents}
          tabs={tabs}
          tabUi={tabUi}
          historyList={historyList}
          historyLoaded={historyLoaded}
          archived={section === 'archive'}
          isActive={isActive}
          group={historyGroup}
          onGroupChange={onHistoryGroupChange}
          onOpenSession={onOpenHistory}
        />
      )}
      {section === 'mcp' && <McpServersView />}
      {section === 'custom-acp' && <CustomAcpView />}
      {section === 'prompt-library' && <PromptLibraryView />}
      {section === 'system-instructions' && <SystemInstructionsView />}
      {(section === 'general' || section === 'appearance' || section === 'shortcuts') && (
        <SettingsView section={section} />
      )}
    </SectionFrame>
  );
}
