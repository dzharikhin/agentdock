import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, FolderInput } from 'lucide-react';
import type { HistorySessionMeta } from '../../types/chat';
import { ACPBridge } from '../../utils/bridge';
import { popupMenuItemClassName } from '../ui/PopupMenu';
import { PopupSubmenu, PopupSubmenuOption, PopupSubmenuSeparator } from '../ui/PopupSubmenu';
import { TabTitleInput } from '../tabbar/TabTitleInput';

/** The groups of the history's conversations, alphabetical; a group exists while a conversation is in it. */
export function historyGroups(historyList: HistorySessionMeta[]): string[] {
  return Array.from(new Set(historyList.flatMap((item) => (item.group ? [item.group] : []))))
    .sort((a, b) => a.localeCompare(b));
}

/** The listed group (`''` the ungrouped conversations, `null` all) while it exists, otherwise all. */
export const existingGroup = (groups: string[], group: string | null) =>
  groups.length > 0 && (group === '' || groups.includes(group ?? '')) ? group : null;

/** Compact `popupMenuActions` item moving the conversation to a group, a new one or out of them ("Ungrouped"). */
export function moveToGroupAction(item: HistorySessionMeta, groups: string[]) {
  return (close: () => void) => (
    <PopupSubmenu key="move-to-group" label="Move to group" icon={<FolderInput size={12} aria-hidden="true" />} compact>
      <GroupOptions items={[item]} groups={groups} onMove={close} />
    </PopupSubmenu>
  );
}

/** `popupMenuActions` item archiving the conversation or unarchiving the archived one. */
export const archiveAction = (item: HistorySessionMeta) => ({
  label: item.archived ? 'Unarchive' : 'Archive',
  icon: item.archived ? <ArchiveRestore size={12} aria-hidden="true" /> : <Archive size={12} aria-hidden="true" />,
  onClick: () => ACPBridge.updateHistoryConversations(item.projectPath, [item.conversationId], { archived: !item.archived }),
});

/**
 * Menu items moving the conversations to one of the groups, out of them ("Ungrouped", `''`) or to a new one: "New
 * group…" turns into a name input. The conversations' common group is chosen.
 */
export function GroupOptions({ items, groups, onMove }: {
  items: HistorySessionMeta[];
  groups: string[];
  onMove: () => void;
}) {
  const [creating, setCreating] = useState(false);
  // Leaving the name input focuses "New group…" again, so the submenu keeps the focus.
  const refocusRef = useRef(false);
  const itemGroups = new Set(items.map((item) => item.group ?? ''));
  const current = itemGroups.size === 1 ? [...itemGroups][0] : null;
  const onSelect = (group: string) => {
    onMove();
    const moved = items.filter((item) => (item.group ?? '') !== group);
    if (moved.length === 0) return;
    ACPBridge.updateHistoryConversations(moved[0].projectPath, moved.map((item) => item.conversationId), { group });
  };

  return (
    <>
      {groups.map((group) => (
        <PopupSubmenuOption key={group} label={group} chosen={group === current} onClick={() => onSelect(group)} />
      ))}
      {groups.length > 0 ? <PopupSubmenuSeparator /> : null}
      <PopupSubmenuOption label="Ungrouped" chosen={current === ''} onClick={() => onSelect('')} />
      {creating ? (
        // Zero intrinsic width: the input fills the submenu without widening it.
        <div className="my-0.5 flex min-h-[26px] w-0 min-w-full items-center">
          <TabTitleInput
            initialTitle=""
            ariaLabel="New group name"
            onCommit={onSelect}
            onClose={() => {
              refocusRef.current = true;
              setCreating(false);
            }}
            className="rounded bg-background px-2 py-1 text-foreground
              focus:!shadow-[inset_0_0_0_1px_var(--ide-Button-default-focusColor)]"
          />
        </div>
      ) : (
        <button
          ref={(element) => {
            if (!element || !refocusRef.current) return;
            refocusRef.current = false;
            element.focus();
          }}
          type="button"
          role="menuitem"
          onClick={() => setCreating(true)}
          className={popupMenuItemClassName(true)}
        >
          <span className="truncate">New group…</span>
        </button>
      )}
    </>
  );
}
