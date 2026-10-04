import { RefObject } from 'react';
import { AgentOption } from '../../types/chat';
import { moveMenuFocus } from './menuFocus';
import { AgentRow } from './NewChatSplitButton';
import { NavigationActions, NavigationActionsProps } from './NavigationActions';
import { OpenChatList, OpenChatListProps } from './OpenChatList';

interface NavigationMenuProps extends NavigationActionsProps, OpenChatListProps {
  menuListRef: RefObject<HTMLDivElement>;
  menuButtonRef: RefObject<HTMLButtonElement>;
  runnableAgents: AgentOption[];
  onNewTabWithAgent: (agentId: string) => void;
  onCloseMenu: () => void;
}

export function NavigationMenu({
  menuListRef,
  menuButtonRef,
  runnableAgents,
  onNewTabWithAgent,
  onCloseMenu,
  ...props
}: NavigationMenuProps) {
  const { agents } = props;

  return (
    <div
      ref={menuListRef}
      className="absolute top-full right-0 mt-1 w-[250px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-4rem)] overflow-y-auto whitespace-nowrap bg-background-secondary
        border border-border rounded-[8px] py-1.5 z-50 text-ide-small"
      role="menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCloseMenu();
          menuButtonRef.current?.focus();
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveMenuFocus(menuListRef.current, 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveMenuFocus(menuListRef.current, -1);
        }
      }}
    >
      <div className="flex min-h-7 items-center px-3.5 text-ide-small text-[var(--ide-Label-disabledForeground)]">New Chat</div>
      {runnableAgents.length > 0 ? (
        runnableAgents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} agents={agents} onNewTabWithAgent={onNewTabWithAgent} onAction={onCloseMenu} />
        ))
      ) : (
        <div className="px-4 min-h-8 text-[var(--ide-Label-disabledForeground)] italic">No available agents</div>
      )}
      <OpenChatList {...props} onAction={onCloseMenu} />
      <div className="h-px bg-border my-1 mx-2" />
      <NavigationActions {...props} onAction={onCloseMenu} />
    </div>
  );
}
