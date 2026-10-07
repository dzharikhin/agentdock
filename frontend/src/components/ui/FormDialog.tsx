import { ReactNode, useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ModalContainerContext } from '../ConfirmationModal';

interface FormDialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function FormDialog({
  isOpen,
  title,
  onClose,
  children,
  footer
}: FormDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const container = useContext(ModalContainerContext);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const dialog = dialogRef.current;
    if (!dialog) return;

    window.setTimeout(() => {
      const focusTarget = dialog.querySelector<HTMLElement>('[data-autofocus="true"]');
      (focusTarget ?? dialog).focus();
    }, 0);

    return () => {
      previousFocusedElementRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen || !container) return null;

  // In flow inside the section popup modal layer, so the popup grows to fit the dialog. A press beside the dialog closes
  // it; a press, unlike a click, does not count a text selection dragged out of a field.
  return createPortal(
    <div
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-10"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-full w-full min-w-0 max-w-[400px] flex-col overflow-hidden rounded-[8px] border border-border
          bg-background text-foreground shadow-popup"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between px-3 py-2.5">

          <div id={titleId} className="min-w-0 truncate text-foreground">{title}</div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] p-1 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground focus:outline-none focus-visible:shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)]"
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-3 py-2">
          {children}
        </div>

        {footer ? (
          <div className="flex items-center justify-end gap-4 px-3 py-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    container
  );
}
