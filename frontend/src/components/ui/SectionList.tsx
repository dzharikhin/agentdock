import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2 } from 'lucide-react';
import { Tooltip } from '../chat/shared/Tooltip';
import { rowFocusClassName } from '../tabbar/rows';
import { Checkbox } from './Checkbox';

export const sectionRowButtonClassName = `flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px]
  text-foreground-secondary hover:bg-hover hover:text-foreground ${rowFocusClassName}`;

/** Icon button of a section list row; `label` is its tooltip. */
export function SectionRowButton({ label, className = '', ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip variant="minimal" content={label}>
      <button type="button" {...props} className={`${sectionRowButtonClassName} ${className}`} />
    </Tooltip>
  );
}

export type RowStatus = 'loading' | 'connected' | 'error';

const STATUS_VISUALS: Record<RowStatus, { dotClass: string; label: string }> = {
  loading: { dotClass: 'bg-warning animate-pulse', label: 'Checking…' },
  connected: { dotClass: 'bg-success', label: 'Reachable' },
  error: { dotClass: 'bg-error', label: 'Error' },
};

/** Row description with a status dot and label; `label` replaces the default label of the status. */
export function StatusLine({ text, status, label = status && STATUS_VISUALS[status].label }: {
  text: string;
  status?: RowStatus;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {status ? (
        <span
          role="img"
          aria-label={label}
          className={`mt-[-2px] inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_VISUALS[status].dotClass}`}
        />
      ) : null}
      <span className="truncate">{text}{label ? ` · ${label}` : ''}</span>
    </div>
  );
}

interface SectionListRowProps {
  name: string;
  description: ReactNode;
  /** Shown in full below the row. */
  error?: string;
  /** Given with `onToggle`, a checkbox enables the item. */
  enabled?: boolean;
  onToggle?: () => void;
  /** Buttons before Edit and Delete. */
  actions?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

/** Item of a section list: the checkbox and buttons are centered on the name and description. */
export function SectionListRow({ name, description, error, enabled, onToggle, actions, onEdit, onDelete }: SectionListRowProps) {
  return (
    <div className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        {onToggle ? (
          <Checkbox
            checked={!!enabled}
            onCheckedChange={onToggle}
            aria-label={`${enabled ? 'Disable' : 'Enable'} ${name}`}
            className="!top-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate">{name}</div>
          <div className="mt-1 truncate text-xs text-foreground-secondary">{description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <SectionRowButton label="Edit" onClick={onEdit} aria-label={`Edit ${name}`}>
            <Pencil size={13} />
          </SectionRowButton>
          <SectionRowButton label="Delete" onClick={onDelete} aria-label={`Delete ${name}`}>
            <Trash2 size={13} />
          </SectionRowButton>
        </div>
      </div>
      {/* Errors are shown in full: wrapped over as many lines as needed, with scrolling only as a guard against
          unusually long output. */}
      {error ? (
        <div className={`mt-1 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words text-xs text-error
          ${onToggle ? 'pl-7' : ''}`}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Shown in place of an empty section list. */
export function SectionEmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="mt-12 flex flex-1 flex-col items-center gap-2 text-foreground-secondary">
      <Icon size={28} strokeWidth={1.5} />
      <span>{title}</span>
      <p className="mt-2 max-w-[400px] text-center">{children}</p>
    </div>
  );
}
