import type { ReactNode } from 'react';
import { Tooltip } from '../chat/shared/Tooltip';
import type { PopupMenuTriggerProps } from '../ui/PopupMenu';

export const rowFocusClassName = `focus:outline-none focus-visible:rounded-[4px] focus-visible:outline focus-visible:outline-1
  focus-visible:outline-[var(--ide-Button-default-focusColor)] focus-visible:outline-offset-[-1px]`;

/** Sidebar row: tinted while revealed (`reveal:`), its action buttons included; the active row is tinted more. */
export const sidebarRowClassName = (active: boolean) => `relative flex items-stretch rounded-[4px] text-foreground
  ${active ? 'bg-active' : 'reveal:bg-hover'}`;

/** Row in the tab bar menu: tinted as in the sidebar. */
export const menuRowClassName = (active: boolean) => `mx-2 mb-0.5 ${sidebarRowClassName(active)}`;

/** Main button of a row. */
export const rowButtonClassName = `flex min-h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left ${rowFocusClassName}`;

interface RowActionProps {
  label: string;
  tooltip?: string;
  /** In the tab bar menu: a menu item. */
  menu: boolean;
  wide?: boolean;
  /** Shown also while the row is not revealed. */
  visible?: boolean;
  placement?: 'top' | 'bottom';
  className?: string;
  onClick?: () => void;
  /** Makes the button the trigger of a `PopupMenu`. */
  trigger?: PopupMenuTriggerProps;
  children: ReactNode;
}

/** Action button at the end of a row (`group`), shown while the row is revealed unless `visible`. */
export function RowAction({
  label,
  tooltip = label,
  menu,
  wide = false,
  visible = false,
  placement = 'bottom',
  className = '',
  onClick,
  trigger,
  children,
}: RowActionProps) {
  return (
    <div className={`flex overflow-hidden ${visible ? '' : `w-0 opacity-0 pointer-events-none group-reveal:opacity-100
      group-reveal:pointer-events-auto ${wide ? 'group-reveal:w-7' : 'group-reveal:w-6'}`} ${className}`}
    >
      <Tooltip variant="minimal" placement={placement} content={tooltip} className="flex">
        <button
          type="button"
          data-row-action
          role={menu ? 'menuitem' : undefined}
          aria-label={label}
          {...trigger}
          onClick={(event) => {
            event.stopPropagation();
            (trigger?.onClick ?? onClick)?.();
          }}
          className={`flex shrink-0 items-center justify-center text-foreground-secondary ${wide ? 'w-7' : 'w-6'}
            hover:text-foreground ${rowFocusClassName}`}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  );
}
