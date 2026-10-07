import { useState } from 'react';

/**
 * Manages expand/collapse state for tool call blocks. Blocks start collapsed.
 */
export function useAutoCollapse() {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = () => setIsExpanded(v => !v);

  return { isExpanded, toggle };
}
