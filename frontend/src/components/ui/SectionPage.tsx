import type { ReactNode } from 'react';

interface SectionPageProps {
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Body of a section in the section popup, which owns the title. The toolbar stays fixed above the scrolling content;
 * actions open the content, right-aligned.
 */
export function SectionPage({ toolbar, actions, children }: SectionPageProps) {
  return (
    <div className="flex min-h-0 flex-col">
      {toolbar}
      <div className="min-h-0 overflow-y-auto">
        <div className="flex flex-col pb-12 pt-5">
          {actions ? <div className="flex items-center justify-end gap-2 px-4 pb-2">{actions}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
