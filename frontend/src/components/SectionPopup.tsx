import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Tooltip } from './chat/shared/Tooltip';
import { ModalContainerContext } from './ConfirmationModal';
import { iconButtonClassName } from './LayoutControls';
import type { NavigationAction } from './tabbar/NavigationActions';

interface SectionPopupProps {
  open: boolean;
  action?: NavigationAction;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal dialog over the whole plugin window, as wide as the chat content. Its height follows the content and its top
 * edge is fixed, so the title bar does not move when the content changes. A backdrop click or Esc closes it. It stays
 * mounted while closed so cached sections keep their state.
 *
 * Dialogs opened by a section render into a layer stacked over the frame in the same grid cell, so they cover and center
 * in it, and the frame grows to fit a dialog taller than the section content.
 */
export function SectionPopup({ open, action, onClose, children }: SectionPopupProps) {
  const [dialog, setDialog] = useState<HTMLDivElement | null>(null);
  const [modalLayer, setModalLayer] = useState<HTMLDivElement | null>(null);
  const label = action?.label;

  useEffect(() => {
    if (open) dialog?.focus();
  }, [dialog, open]);

  return (
    <div
      className={`absolute inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-[clamp(1rem,6vh,3rem)] ${
        open ? 'visible' : 'invisible'
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={setDialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.preventDefault();
          onClose();
        }}
        className="grid max-h-full w-full max-w-app-content grid-rows-[minmax(0,1fr)] overflow-hidden rounded-[8px] border border-border
          bg-background focus:outline-none"
      >
        <div className="col-start-1 row-start-1 flex min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 pl-4 pr-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0">{action?.icon}</span>
              <span className="truncate text-ide-regular">{label}</span>
            </div>
            <Tooltip variant="minimal" placement="bottom" content="Close" className="flex">
              <button
                type="button"
                onClick={onClose}
                className={iconButtonClassName}
                aria-label={label ? `Close ${label}` : 'Close'}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <div className="flex min-h-0 flex-col">
            <ModalContainerContext.Provider value={modalLayer}>{children}</ModalContainerContext.Provider>
          </div>
        </div>
        <div ref={setModalLayer} className="relative z-[100] col-start-1 row-start-1 flex min-h-0 empty:hidden" />
      </div>
    </div>
  );
}
