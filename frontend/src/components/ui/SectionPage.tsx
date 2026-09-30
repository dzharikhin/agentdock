import type { ReactNode } from 'react';

interface SectionPageProps {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionPage({ title, actions, className = '', children }: SectionPageProps) {
  return (
    <div className={`h-full w-full overflow-y-auto app-wide:px-2 ${className}`}>
      <div className="mx-auto flex min-h-full w-full max-w-app-content flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-6 pt-[calc(1rem+var(--content-top-inset,0px))]">
          <h2 className="min-w-0 text-ide-h2 font-normal leading-tight">{title}</h2>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
