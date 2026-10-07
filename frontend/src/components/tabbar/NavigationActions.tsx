import type { SectionType } from '../../types/chat';
import {
  DesignTabIcon,
  HistoryTabIcon,
  ManagementTabIcon,
  McpTabIcon,
  CustomAcpTabIcon,
  PromptLibraryTabIcon,
  SettingsTabIcon,
  SystemInstructionsTabIcon,
} from './TabIcons';

export type NavigationAction = {
  type: SectionType;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
};

export interface NavigationActionsProps {
  onOpenHistory: () => void;
  onOpenManagement: () => void;
  onOpenDesignSystem: () => void;
  onOpenMcp: () => void;
  onOpenCustomAcp: () => void;
  onOpenPromptLibrary: () => void;
  onOpenSystemInstructions: () => void;
  onOpenSettings: () => void;
}

export function getNavigationActions({
  onOpenHistory,
  onOpenManagement,
  onOpenDesignSystem,
  onOpenMcp,
  onOpenCustomAcp,
  onOpenPromptLibrary,
  onOpenSystemInstructions,
  onOpenSettings,
}: NavigationActionsProps): NavigationAction[] {
  const isDev = !!(window as any).__IS_DEV;
  return [
    { type: 'management', label: 'Service Providers', icon: <ManagementTabIcon />, onClick: onOpenManagement },
    { type: 'settings', label: 'Settings', icon: <SettingsTabIcon />, onClick: onOpenSettings },
    { type: 'prompt-library', label: 'Prompt Library', icon: <PromptLibraryTabIcon />, onClick: onOpenPromptLibrary },
    { type: 'system-instructions', label: 'System Instructions', icon: <SystemInstructionsTabIcon />, onClick: onOpenSystemInstructions },
    { type: 'mcp', label: 'MCP Servers', icon: <McpTabIcon />, onClick: onOpenMcp },
    { type: 'custom-acp', label: 'Custom ACP', icon: <CustomAcpTabIcon />, onClick: onOpenCustomAcp },
    { type: 'history', label: 'Chat History', icon: <HistoryTabIcon />, onClick: onOpenHistory },
    ...(isDev ? [{ type: 'design' as const, label: 'Design System', icon: <DesignTabIcon />, onClick: onOpenDesignSystem }] : []),
  ];
}
