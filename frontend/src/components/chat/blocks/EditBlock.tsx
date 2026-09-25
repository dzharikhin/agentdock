import React, { useMemo } from 'react';
import { ToolCallBlock } from '../../../types/chat';
import { ChevronRight, FileDiff } from 'lucide-react';
import { FileIcon } from '../shared/FileIcon';
import { diff_match_patch } from 'diff-match-patch';
import hljs, { getLanguageFromPath } from '../../../utils/highlight';
import { sanitizeCodeHtml } from '../../../utils/sanitizeHtml';
import { parseToolStatus } from '../../../utils/toolCallUtils';
import { useAutoCollapse } from '../../../hooks/useAutoCollapse';
import '../../../styles/markdown.css';
import { chatFocusClassName, chatInsetFocusClassName } from '../shared/focusStyles';
import { Tooltip } from '../shared/Tooltip';

interface Props {
  block: ToolCallBlock;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
  highlightedHtml?: string;
  hunkIndex: number;
}

const INLINE_DIFF_THRESHOLD = 100;
const MAX_INLINE_DIFF_LINES = 1000;
const CONTEXT_LINES = 3;

function countLines(text: string): number {
  if (!text) return 0;
  let count = text.endsWith('\n') ? 0 : 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}

function trimUnchangedEdges(oldText: string, newText: string): [string, string] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= prefix && newEnd >= prefix && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const start = Math.max(0, prefix - CONTEXT_LINES);
  return [
    oldLines.slice(start, oldEnd + CONTEXT_LINES + 1).join('\n'),
    newLines.slice(start, newEnd + CONTEXT_LINES + 1).join('\n'),
  ];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const EditBlock: React.FC<Props> = ({ block }) => {
  const { isPending, isError, isFinished } = parseToolStatus(block.entry.status);
  const { isExpanded, toggle } = useAutoCollapse();

  const diffData = useMemo(() => {
    const content = block.entry.content;
    if (!content || !Array.isArray(content)) return null;

    const normalizeLineEndings = (text: string) => text.replace(/\r\n?/g, '\n');
    const diffEntries = content
      .filter((item) => item?.type === 'diff' || (item?.path !== undefined && item?.newText !== undefined))
      .map((item) => ({
        ...item,
        type: 'diff',
        path: item.path || '',
        oldText: item.oldText == null ? null : normalizeLineEndings(item.oldText),
        newText: normalizeLineEndings(item.newText ?? ''),
      }))
      .filter((entry) => (entry.oldText ?? '') !== entry.newText);

    if (diffEntries.length === 0) return null;

    const filePath = block.entry.locations?.[0]?.path || diffEntries[0].path || block.entry.title || 'Unknown file';
    const language = getLanguageFromPath(filePath);
    const trim = diffEntries.reduce((total, entry) =>
      total + Math.max(countLines(entry.oldText ?? ''), countLines(entry.newText)), 0) >= INLINE_DIFF_THRESHOLD;

    let additions = 0;
    let deletions = 0;
    const lines: DiffLine[] = [];
    let tooLarge = false;

    const addLines = (
      text: string,
      type: 'added' | 'removed' | 'context',
      oldLineNumRef: { value: number },
      newLineNumRef: { value: number },
      hunkIndex: number
    ) => {
      const splitLines = text.split('\n');
      if (splitLines.length > 1 && splitLines[splitLines.length - 1] === '') {
        splitLines.pop();
      }
      if (lines.length + splitLines.length > MAX_INLINE_DIFF_LINES) {
        tooLarge = true;
        return;
      }

      splitLines.forEach((line) => {
        let highlightedHtml: string;
        try {
          highlightedHtml = sanitizeCodeHtml(hljs.highlight(line, { language, ignoreIllegals: true }).value);
        } catch {
          highlightedHtml = escapeHtml(line);
        }

        if (type === 'added') {
          additions++;
          lines.push({ type, content: line, newLine: newLineNumRef.value++, highlightedHtml, hunkIndex });
        } else if (type === 'removed') {
          deletions++;
          lines.push({ type, content: line, oldLine: oldLineNumRef.value++, highlightedHtml, hunkIndex });
        } else {
          lines.push({
            type,
            content: line,
            oldLine: oldLineNumRef.value++,
            newLine: newLineNumRef.value++,
            highlightedHtml,
            hunkIndex,
          });
        }
      });
    };

    for (const [hunkIndex, entry] of diffEntries.entries()) {
      const [oldText, newText] = trim && entry.oldText !== null
        ? trimUnchangedEdges(entry.oldText, entry.newText)
        : [entry.oldText ?? '', entry.newText];
      if (Math.max(countLines(oldText), countLines(newText)) > MAX_INLINE_DIFF_LINES) {
        tooLarge = true;
        break;
      }
      const dmp = new diff_match_patch();
      const lineMode = dmp.diff_linesToChars_(oldText, newText);
      const diffs = dmp.diff_main(lineMode.chars1, lineMode.chars2, false);
      dmp.diff_charsToLines_(diffs, lineMode.lineArray);

      const oldLineNumRef = { value: 1 };
      const newLineNumRef = { value: 1 };
      for (const [op, text] of diffs) {
        if (op === 1) addLines(text, 'added', oldLineNumRef, newLineNumRef, hunkIndex);
        else if (op === -1) addLines(text, 'removed', oldLineNumRef, newLineNumRef, hunkIndex);
        else addLines(text, 'context', oldLineNumRef, newLineNumRef, hunkIndex);
        if (tooLarge) break;
      }
      if (tooLarge) break;
    }

    return { filePath, additions, deletions, lines: tooLarge ? [] : lines, tooLarge };
  }, [block.entry.content, block.entry.title, block.entry.locations]);

  const fileName = useMemo(() => {
    if (!diffData?.filePath) return 'File Edit';
    const parts = diffData.filePath.split(/[\\/]/);
    return parts[parts.length - 1];
  }, [diffData?.filePath]);
  const showInline = !diffData?.tooLarge;

  const handleOpenFile = () => {
    const bestPath = block.entry.locations?.[0]?.path || diffData?.filePath || block.entry.title;
    if (bestPath && window.__openFile) {
      window.__openFile(JSON.stringify({ filePath: bestPath }));
    }
  };

  const handleShowDiff = () => {
    if (!diffData || typeof window.__showDiff !== 'function') return;
    const content = block.entry.content;
    if (!content || !Array.isArray(content)) return;
    const operations = content
      .filter((item) => item?.type === 'diff' || (item?.path !== undefined && item?.newText !== undefined))
      .map((item) => ({ oldText: item.oldText ?? '', newText: item.newText ?? '' }));
    window.__showDiff(JSON.stringify({ filePath: diffData.filePath, status: 'M', operations }));
  };

  const handleOpenFileKeyDown: React.KeyboardEventHandler<HTMLSpanElement> = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    handleOpenFile();
  };

  return (
    <div className="border border-border rounded-[6px] overflow-hidden mb-2">
      <button
        onClick={showInline ? toggle : undefined}
        className={`flex items-center gap-2 w-full px-3 h-9 bg-background-secondary ${chatInsetFocusClassName}`}
      >
        <div className="flex-shrink-0 text-foreground-secondary">
          <FileIcon filePath={diffData?.filePath} className="h-[14px] w-[14px] flex-shrink-0 text-foreground" />
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleOpenFile(); }}
            onKeyDown={handleOpenFileKeyDown}
            className={`font-mono truncate text-editor-fg opacity-90 hover:underline cursor-pointer text-left ${chatFocusClassName}`}
          >
            {fileName}
          </span>
          {diffData && !diffData.tooLarge && (
            <div className="flex items-center gap-1.5 ml-1 flex-shrink-0 text-ide-small">
              {diffData.additions > 0 && (
                <span className="font-bold text-added leading-none">
                  +{diffData.additions}
                </span>
              )}
              {diffData.deletions > 0 && (
                <span className="font-bold text-deleted leading-none">
                  -{diffData.deletions}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {diffData && isFinished && (
            <Tooltip variant="minimal" content="View diff in editor">
              <button
                type="button"
                className={`p-1 text-foreground-secondary hover:text-foreground rounded transition-colors ${chatFocusClassName}`}
                onClick={(e) => { e.stopPropagation(); handleShowDiff(); }}
              >
                <FileDiff size={14} />
              </button>
            </Tooltip>
          )}
          {(isPending || isError) && (
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isPending ? 'bg-warning animate-pulse' : 'bg-error'
              }`}
            />
          )}
          {showInline && (
            <div className={`transition-transform duration-200 text-editor-fg opacity-50 ${isExpanded ? 'rotate-90' : ''}`}>
              <ChevronRight size={14} />
            </div>
          )}
        </div>
      </button>

      {showInline && (
        <div {...(!isExpanded ? { inert: '' } : {})}
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out overflow-hidden ${isExpanded ? 'border-t border-border' : ''}`}
          style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
        >
        <div className="overflow-hidden">
          {diffData && (
            <div tabIndex={-1} className="bg-editor-bg max-h-[400px] overflow-auto [&::-webkit-scrollbar]:!h-[7px]">
              <div className="syntax-highlighted font-mono text-ide-small py-2 min-w-max inline-block w-full">
                {diffData.lines.map((line, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && line.hunkIndex !== diffData.lines[i - 1].hunkIndex && (
                      <div className="h-px my-1" />
                    )}
                    <div
                      className={`flex w-full ${
                        line.type === 'added' ? 'bg-added-bg' :
                        line.type === 'removed' ? 'bg-deleted-bg' :
                        ''
                      }`}
                    >
                      <div className={`w-5 flex-shrink-0 flex justify-center select-none py-0.5 font-bold ${
                        line.type === 'added' ? 'text-success' :
                        line.type === 'removed' ? 'text-error' :
                        'text-editor-fg'
                      }`}>
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </div>
                      <div
                        className="flex-none w-max cursor-text px-1 whitespace-pre break-all py-0.5 text-editor-fg"
                        dangerouslySetInnerHTML={{ __html: line.highlightedHtml || ' ' }}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {!diffData && (
            <div className="p-4 bg-editor-bg text-center">
              <span className="opacity-40 italic">
                {isFinished ? 'No diff information available.' : 'Calculating diff...'}
              </span>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
};
