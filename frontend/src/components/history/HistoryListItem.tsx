import { Bot, EllipsisVertical, Pencil, Pin, SquareTerminal, Trash2 } from 'lucide-react';
import { ACPBridge } from '../../utils/bridge';
import type { AgentOption, HistorySessionMeta } from '../../types/chat';
import { Checkbox } from '../ui/Checkbox';
import { PopupMenu, popupMenuActions } from '../ui/PopupMenu';
import { PinIcon } from '../tabbar/OpenChatList';
import { Tooltip } from '../chat/shared/Tooltip';
import { SectionRowButton, sectionRowButtonClassName } from '../ui/SectionList';
import { TabTitleInput } from '../tabbar/TabTitleInput';

function getItemAgents(item: HistorySessionMeta): string[] {
  return item.allAdapterNames && item.allAdapterNames.length > 0
    ? item.allAdapterNames
    : [item.adapterName];
}

function handleHistoryRowKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  disabled: boolean,
  onActivate: () => void
) {
  if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  event.stopPropagation();
  onActivate();
}

interface HistoryListItemProps {
  item: HistorySessionMeta;
  adapterDisplay: Map<string, AgentOption>;
  isSelected: boolean;
  /** Open as a chat; resuming in the terminal suits only closed chats. */
  isOpen: boolean;
  conversationLength: string | null;
  deleteError?: string;
  isEditing: boolean;
  formatDate: (ms: number) => string;
  onOpenSession: (session: HistorySessionMeta) => void;
  onEditingChange: (editing: boolean) => void;
  onOpenDeleteConfirmation: (items: HistorySessionMeta[]) => void;
  onToggleSelection: (conversationId: string) => void;
}

export function HistoryListItem({
  item,
  adapterDisplay,
  isSelected,
  isOpen,
  conversationLength,
  deleteError,
  isEditing,
  formatDate,
  onOpenSession,
  onEditingChange,
  onOpenDeleteConfirmation,
  onToggleSelection,
}: HistoryListItemProps) {
  const conversationId = item.conversationId;
  const itemAgents = getItemAgents(item);
  const otherAgents = itemAgents.filter(a => a !== item.adapterName);
  const mainAgent = adapterDisplay.get(item.adapterName);
  const mainLabel = mainAgent?.name || item.adapterName;
  const canOpenCli = !isOpen && !!mainAgent?.cliResumeAvailable;
  const canDelete = item.deletable !== false;

  return (
    <div className="group relative border-b border-border last:border-b-0">
      <div className="min-h-[56px] flex items-center gap-3 max-[400px]:gap-2 py-1">
        <div
          role="button"
          tabIndex={isEditing ? -1 : 0}
          className="flex min-w-0 flex-1 items-center gap-3 max-[400px]:gap-2 cursor-pointer rounded-[4px]
            focus-visible:shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)] focus-visible:outline-none"
          onClick={() => { if (!isEditing) onOpenSession(item); }}
          onKeyDown={(event) => handleHistoryRowKeyDown(event, isEditing, () => onOpenSession(item))}
        >
          <div className="flex flex-col items-center shrink-0 gap-0.5 pt-0.5 mx-0.5 section-narrow:hidden">
            {mainAgent?.custom ? (
              <Bot className="h-7 w-7 text-foreground-secondary opacity-75" strokeWidth={1.5} />
            ) : mainAgent?.iconPath ? (
              <img src={mainAgent.iconPath} alt={mainLabel} className="h-7 w-7 object-contain opacity-75" />
            ) : (
              <div className="flex items-center justify-center rounded bg-background border border-border font-bold uppercase shrink-0 h-8 w-8 text-base">
                {mainLabel.slice(0, 1)}
              </div>
            )}

            {otherAgents.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-0.5 py-0.5 w-full">
                {otherAgents.map((agentId, idx) => {
                  const adapter = adapterDisplay.get(agentId);
                  const iconLabel = adapter?.name || agentId;
                  if (adapter?.custom) {
                    return <Bot key={idx} className="h-4 w-4 text-foreground-secondary opacity-80" strokeWidth={1.5} />;
                  }
                  if (adapter?.iconPath) {
                    return <img key={idx} src={adapter.iconPath} className="h-4 w-4 object-contain opacity-80" />;
                  }
                  return (
                    <div key={idx} className="flex h-4 min-w-4 items-center justify-center rounded bg-background
                      border border-border text-[9px] font-bold uppercase shrink-0 opacity-80">
                      {iconLabel.slice(0, 1)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
            {isEditing ? (
              <div className="flex">
                <TabTitleInput
                  initialTitle={item.title}
                  onCommit={(title) =>
                    ACPBridge.updateHistoryConversation(item.projectPath, conversationId, { newTitle: title })}
                  onClose={() => onEditingChange(false)}
                  className="-ml-1 rounded-[3px] bg-background px-1 py-0.5 font-semibold"
                />
              </div>
            ) : (
              <div className="py-0.5 text-ide-small font-semibold truncate">{item.title}</div>
            )}
            <div className="flex items-center gap-2 text-xs text-foreground-secondary">
              <span>{formatDate(item.updatedAt)}</span>
              {conversationLength || item.modelId ? <span className="opacity-50">&bull;</span> : null}
              {conversationLength ? <span>{conversationLength}</span> : null}
              {item.modelId ? <span>{item.modelId}</span> : null}
            </div>
            {deleteError ? <div className="mt-1 text-xs text-error">{deleteError}</div> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center self-stretch relative z-10 ml-2" onClick={(e) => e.stopPropagation()}>
          <PopupMenu
            renderTrigger={(trigger) => (
              <Tooltip variant="minimal" content="More actions">
                <button
                  type="button"
                  aria-label={`More actions for ${item.title}`}
                  {...trigger}
                  className={sectionRowButtonClassName}
                >
                  <EllipsisVertical className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          >
            {popupMenuActions([
              { label: 'Rename', icon: <Pencil size={12} aria-hidden="true" />, onClick: () => onEditingChange(true) },
              ...(canOpenCli ? [{
                label: 'Open in terminal',
                icon: <SquareTerminal size={12} aria-hidden="true" />,
                onClick: () => ACPBridge.openHistoryConversationCli(item.projectPath, conversationId),
              }] : []),
              ...(canDelete ? [{
                label: 'Delete',
                icon: <Trash2 size={12} aria-hidden="true" />,
                onClick: () => onOpenDeleteConfirmation([item]),
              }] : []),
              ...(item.pinned ? [] : [{
                label: 'Pin',
                icon: <PinIcon pinned={false} />,
                onClick: () => ACPBridge.updateHistoryConversation(item.projectPath, conversationId, { pinned: true }),
              }]),
            ], true)}
          </PopupMenu>

          {item.pinned ? (
            <SectionRowButton
              label="Unpin chat"
              onClick={() => ACPBridge.updateHistoryConversation(item.projectPath, conversationId, { pinned: false })}
              className="mr-1"
            >
              <Pin className="h-3.5 w-3.5 rotate-45" fill="currentColor" />
            </SectionRowButton>
          ) : null}

          <Checkbox
            checked={isSelected}
            disabled={!canDelete}
            onCheckedChange={() => onToggleSelection(conversationId)}
            onClick={(e) => e.stopPropagation()}
            className="!top-0 ml-1 disabled:opacity-50"
            aria-label={`Select ${item.title}`}
          />
        </div>
      </div>
    </div>
  );
}
