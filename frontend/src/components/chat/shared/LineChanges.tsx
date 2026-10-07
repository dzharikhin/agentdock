export function LineChanges({ additions, deletions, className = '' }: { additions: number; deletions: number; className?: string }) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <span className={`flex items-center gap-1 flex-shrink-0 text-ide-small font-bold leading-none ${className}`}>
      {additions > 0 && <span className="text-added">+{additions}</span>}
      {deletions > 0 && <span className="text-deleted">-{deletions}</span>}
    </span>
  );
}
