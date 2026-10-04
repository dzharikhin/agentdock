import { KeyboardEvent, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusMenuItem, getMenuItems, moveMenuFocus } from '../tabbar/menuFocus';

/** Styled like the chat input dropdowns (`ChatDropdown`). */
const popupMenuItemClassName = `my-0.5 flex w-full items-center rounded pl-2 pr-3 text-left text-foreground outline-none
  focus-visible:shadow-[inset_0_0_0_1px_var(--ide-Button-default-focusColor)]`;

export interface PopupMenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/**
 * `PopupMenu` children for a plain list of actions; choosing one closes the menu. `compact` suits menus of row actions:
 * lower items with the sidebar row hover.
 */
export const popupMenuActions = (actions: PopupMenuAction[], compact = false) => (close: () => void) => actions.map((action) => (
  <button
    key={action.label}
    type="button"
    role="menuitem"
    onClick={() => {
      close();
      action.onClick();
    }}
    className={`${popupMenuItemClassName} ${compact
      ? 'min-h-[26px] hover:bg-hover'
      : 'min-h-8 hover:bg-accent hover:text-accent-foreground'}`}
  >
    <span className="mr-2 flex">{action.icon}</span>
    <span className="truncate">{action.label}</span>
  </button>
));

export interface PopupMenuTriggerProps {
  ref: RefObject<HTMLButtonElement>;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** Gap between the panel and the trigger, and the least distance between the panel and the window's right edge. */
const PANEL_GAP_PX = 4;
const WINDOW_EDGE_PX = 8;

/**
 * The panel opens below the trigger at its natural width, from the trigger's left edge to the right, and is shifted left
 * where it would cross the plugin window's right edge. It is portaled to `document.body`, so containers that clip their
 * overflow (the sidebar) do not cut it off.
 */
interface PopupMenuProps {
  renderTrigger: (props: PopupMenuTriggerProps) => ReactNode;
  children: (close: () => void) => ReactNode;
}

export function PopupMenu({ renderTrigger, children }: PopupMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Item to focus once the panel opens; -1 is the last. */
  const focusItemRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // The panel is first rendered transparent (still focusable) at the top left, measured, then placed.
  useLayoutEffect(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!open || !trigger || !panel) {
      setPosition(null);
      return;
    }
    setPosition({
      top: trigger.bottom + PANEL_GAP_PX,
      left: Math.max(0, Math.min(trigger.left, window.innerWidth - WINDOW_EDGE_PX - panel.offsetWidth)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (focusItemRef.current !== null) {
      focusMenuItem(panelRef.current, focusItemRef.current);
      focusItemRef.current = null;
    }
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    return () => window.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="flex min-w-0">
      {renderTrigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: () => setOpen((current) => !current),
        // As in `ChatDropdown`: keys open the panel and focus its first item, ArrowUp its last; the portaled panel is
        // not next in the tab order, so Tab from the trigger moves into it while it is open.
        onKeyDown: (event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            close();
            return;
          }
          const index = event.key === 'ArrowUp' ? -1
            : ['ArrowDown', 'Enter', ' '].includes(event.key) || (open && event.key === 'Tab' && !event.shiftKey) ? 0
              : null;
          if (index === null) return;
          event.preventDefault();
          if (open) {
            focusMenuItem(panelRef.current, index);
          } else {
            focusItemRef.current = index;
            setOpen(true);
          }
        },
      })}
      {open ? createPortal(
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
              triggerRef.current?.focus();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveMenuFocus(panelRef.current, event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Tab') {
              const items = getMenuItems(panelRef.current);
              const next = items.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1);
              if (next >= 0 && next < items.length) {
                event.preventDefault();
                items[next].focus();
                return;
              }
              // Past the ends focus returns to the trigger; going forward the panel closes and Tab moves on from it.
              triggerRef.current?.focus();
              if (event.shiftKey) {
                event.preventDefault();
              } else {
                close();
              }
            }
          }}
          style={position ?? { top: 0, left: 0, opacity: 0 }}
          className="fixed z-50 w-max rounded-md border border-border bg-background-secondary px-1 py-0.5 text-ide-small"
        >
          {children(close)}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
