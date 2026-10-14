import type { ReactNode } from 'react';

/** The text with the pattern's matches marked in the colors of the open chat's search. */
export function HighlightedText({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return <>{text}</>;
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(end, match.index), <span key={match.index} className="bg-[#fcd34d] text-black">{match[0]}</span>);
    end = match.index! + match[0].length;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}
