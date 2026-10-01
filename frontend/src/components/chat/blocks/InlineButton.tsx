import React, { ReactNode } from 'react';
import { chatFocusClassName } from '../shared/focusStyles';

// A span acting as a button inside an activity row, which is itself a button and cannot contain one.
export const InlineButton: React.FC<{ onClick: () => void; className?: string; children: ReactNode }> = ({
  onClick, className = '', children,
}) => (
  <span role="button" tabIndex={0} className={`cursor-pointer ${chatFocusClassName} ${className}`}
    onClick={(event) => { event.stopPropagation(); onClick(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }}
  >
    {children}
  </span>
);
