import { diff_match_patch } from 'diff-match-patch';
import { ToolCallEntry } from '../types/chat';

export function countLines(text: string): number {
  if (!text) return 0;
  let count = text.endsWith('\n') ? 0 : 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}

// Diff entries of an edit tool call with normalized line endings, without entries that change nothing.
export function editDiffEntries(entry: ToolCallEntry) {
  if (!Array.isArray(entry.content)) return [];
  const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');
  return entry.content
    .filter((item) => item?.type === 'diff' || (item?.path !== undefined && item?.newText !== undefined))
    .map((item) => ({
      ...item,
      type: 'diff',
      path: item.path || '',
      oldText: item.oldText == null ? null : normalizeLineEndings(item.oldText),
      newText: normalizeLineEndings(item.newText ?? ''),
    }))
    .filter((item) => (item.oldText ?? '') !== item.newText);
}

export function lineDiff(oldText: string, newText: string) {
  const dmp = new diff_match_patch();
  const lineMode = dmp.diff_linesToChars_(oldText, newText);
  const diffs = dmp.diff_main(lineMode.chars1, lineMode.chars2, false);
  dmp.diff_charsToLines_(diffs, lineMode.lineArray);
  return diffs;
}

// Entries are replaced, not mutated, on update, so counts can be cached per entry object across renders.
const editChangesCache = new WeakMap<ToolCallEntry, { additions: number; deletions: number }>();

export function countEditChanges(entry: ToolCallEntry): { additions: number; deletions: number } {
  const cached = editChangesCache.get(entry);
  if (cached) return cached;
  let additions = 0;
  let deletions = 0;
  for (const item of editDiffEntries(entry)) {
    for (const [op, text] of lineDiff(item.oldText ?? '', item.newText)) {
      if (op === 1) additions += countLines(text);
      else if (op === -1) deletions += countLines(text);
    }
  }
  const result = { additions, deletions };
  editChangesCache.set(entry, result);
  return result;
}
