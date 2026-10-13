import { useRef, useState } from 'react';
import { FolderInput } from 'lucide-react';
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

/** Compact `popupMenuActions` item moving the conversation to a group, a new one or out of them ("Ungrouped"). */
export function moveToGroupAction(item: HistorySessionMeta, groups: string[]) {
  const current = item.group ?? '';
  return (close: () => void) => (
    <PopupSubmenu key="move-to-group" label="Move to group" icon={<FolderInput size={12} aria-hidden="true" />} compact>
      <GroupOptions
        groups={groups}
        current={current}
        onSelect={(group) => {
          close();
          if (group !== current) ACPBridge.updateHistoryConversation(item.projectPath, item.conversationId, { group });
        }}
      />
    </PopupSubmenu>
  );
}

/** The groups, "Ungrouped" (`''`) and "New group…", which turns into a name input; the current one is chosen. */
function GroupOptions({ groups, current, onSelect }: {
  groups: string[];
  current: string;
  onSelect: (group: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  // Leaving the name input focuses "New group…" again, so the submenu keeps the focus.
  const refocusRef = useRef(false);

  return (
    <>
      {groups.map((group) => (
        <PopupSubmenuOption key={group} label={group} chosen={group === current} onClick={() => onSelect(group)} />
      ))}
      {groups.length > 0 ? <PopupSubmenuSeparator /> : null}
      <PopupSubmenuOption label="Ungrouped" chosen={current === ''} onClick={() => onSelect('')} />
      {creating ? (
        <div className="my-0.5 flex min-h-[26px] w-48 items-center pl-2 pr-3">
          <TabTitleInput
            initialTitle=""
            ariaLabel="New group name"
            onCommit={onSelect}
            onClose={() => {
              refocusRef.current = true;
              setCreating(false);
            }}
            className="-ml-1 rounded-[3px] bg-background px-1 text-foreground"
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
