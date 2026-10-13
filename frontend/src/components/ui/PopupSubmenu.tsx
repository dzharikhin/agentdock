import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { focusMenuItem, moveMenuFocus } from '../tabbar/menuFocus';
import { PANEL_GAP_PX, popupMenuItemClassName, popupMenuPanelClassName, WINDOW_EDGE_PX } from './PopupMenu';

/** Delay before a submenu the pointer left closes, so the pointer can cross the gap to it. */
const SUBMENU_CLOSE_DELAY_MS = 200;

interface PopupSubmenuProps {
  label: string;
  icon: ReactNode;
  /** Shown dimmed after the label, e.g. the chosen option. */
  value?: string;
  /** As in `popupMenuActions`. */
  compact: boolean;
  /** The submenu's items. */
  children: ReactNode;
}

/** Compact submenu item choosing an option; the current one is chosen. */
export function PopupSubmenuOption({ label, chosen, onClick }: { label: string; chosen: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={popupMenuItemClassName(true, chosen)}>
      <span className="max-w-[200px] truncate">{label}</span>
    </button>
  );
}

export const PopupSubmenuSeparator = () => <div className="mx-1 my-1 h-px bg-border" />;

/**
 * `PopupMenu` item opening a submenu beside the menu, right of it where the window allows: on hover, click, ArrowRight,
 * Enter or Space, the keys focusing its first item. ArrowLeft, Escape and Tab return to the item.
 */
export function PopupSubmenu({ label, icon, value, compact, children }: PopupSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);
  const closeTimerRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  // As in `PopupMenu`: rendered transparent first, measured, then placed, its first item level with the item.
  useLayoutEffect(() => {
    const item = itemRef.current?.getBoundingClientRect();
    const menu = itemRef.current?.closest('[role="menu"]')?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!open || !item || !menu || !panel) {
      setPosition(null);
      return;
    }
    const right = menu.right + PANEL_GAP_PX;
    // The panel's border, padding and the item's margin.
    const firstItemOffset = 5;
    setPosition({
      top: Math.max(0, Math.min(item.top - firstItemOffset, window.innerHeight - WINDOW_EDGE_PX - panel.offsetHeight)),
      left: right + panel.offsetWidth <= window.innerWidth - WINDOW_EDGE_PX
        ? right
        : Math.max(0, menu.left - PANEL_GAP_PX - panel.offsetWidth),
    });
    if (focusFirstRef.current) {
      focusFirstRef.current = false;
      focusMenuItem(panel, 0);
    }
  }, [open]);

  const openSubmenu = (focusFirst: boolean) => {
    window.clearTimeout(closeTimerRef.current);
    focusFirstRef.current = focusFirst;
    if (open && focusFirst) focusMenuItem(panelRef.current, 0);
    setOpen(true);
  };

  const closeSubmenu = () => {
    setOpen(false);
    itemRef.current?.focus();
  };

  return (
    <div
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') openSubmenu(false); }}
      onPointerLeave={(event) => {
        // Stays open while used from the keyboard, e.g. typing in it.
        if (event.pointerType !== 'mouse' || panelRef.current?.contains(document.activeElement)) return;
        closeTimerRef.current = window.setTimeout(() => setOpen(false), SUBMENU_CLOSE_DELAY_MS);
      }}
    >
      <button
        ref={itemRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => openSubmenu(false)}
        onKeyDown={(event) => {
          if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          openSubmenu(true);
        }}
        className={popupMenuItemClassName(compact)}
      >
        <span className="mr-2 flex">{icon}</span>
        <span className="truncate">{label}</span>
        {value ? <span className="ml-auto max-w-[160px] truncate pl-4 text-foreground-secondary">{value}</span> : null}
        <span className={`flex text-foreground-secondary ${value ? 'pl-2' : 'ml-auto pl-4'}`}>
          <ChevronRight size={12} aria-hidden="true" />
        </span>
      </button>
      {/* Nested in the menu's panel, so presses in it count as inside the menu; only it marks chosen items. */}
      {open ? (
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              moveMenuFocus(panelRef.current, event.key === 'ArrowDown' ? 1 : -1);
            } else if (['ArrowLeft', 'Escape', 'Tab'].includes(event.key)) {
              closeSubmenu();
            } else {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
          style={position ?? { top: 0, left: 0, opacity: 0 }}
          className={`group/menu fixed ${popupMenuPanelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
