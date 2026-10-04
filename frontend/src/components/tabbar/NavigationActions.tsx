import type { SectionType } from '../../types/chat';
import { menuRowClassName, rowButtonClassName } from './rows';
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
  activeSection: SectionType | null;
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
    { type: 'history', label: 'History', icon: <HistoryTabIcon />, onClick: onOpenHistory },
    { type: 'management', label: 'Service Providers', icon: <ManagementTabIcon />, onClick: onOpenManagement },
    { type: 'settings', label: 'Settings', icon: <SettingsTabIcon />, onClick: onOpenSettings },
    { type: 'prompt-library', label: 'Prompt Library', icon: <PromptLibraryTabIcon />, onClick: onOpenPromptLibrary },
    { type: 'system-instructions', label: 'System Instructions', icon: <SystemInstructionsTabIcon />, onClick: onOpenSystemInstructions },
    { type: 'mcp', label: 'MCP Servers', icon: <McpTabIcon />, onClick: onOpenMcp },
    { type: 'custom-acp', label: 'Custom ACP', icon: <CustomAcpTabIcon />, onClick: onOpenCustomAcp },
    ...(isDev ? [{ type: 'design' as const, label: 'Design System', icon: <DesignTabIcon />, onClick: onOpenDesignSystem }] : []),
  ];
}

/** Sections offered in the menus; History has its own button or sidebar row. */
export const getMenuActions = (props: NavigationActionsProps) =>
  getNavigationActions(props).filter((action) => action.type !== 'history');

/** Section items for the tab bar menu; the open section is closed from its popup. */
export function NavigationActions(props: NavigationActionsProps & { onAction: () => void }) {
  const { activeSection, onAction } = props;

  return (
    <>
      {getMenuActions(props).map((action) => {
        const isActive = action.type === activeSection;
        return (
          <div key={action.type} className={menuRowClassName(isActive)}>
            <button
              onClick={() => {
                action.onClick();
                onAction();
              }}
              className={rowButtonClassName}
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="flex shrink-0 items-center justify-center">{action.icon}</span>
              <span className="truncate">{action.label}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}
