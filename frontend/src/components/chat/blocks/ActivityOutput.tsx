import React, { ReactNode, useMemo } from 'react';
import { MarkdownMessage } from '../MarkdownMessage';

interface Props {
  // Full tool input shown above the output, such as a command or a search query.
  input: ReactNode;
  result?: string;
  // Shown instead of the output while the tool is running.
  pendingText?: string | null;
}

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

// Some agents wrap the output in one fenced block, optionally preceded by metadata such as the command
// description. Show only the block content; fall back to the metadata when the block is empty.
function unwrapFencedOutput(text: string): string {
  const match = text.match(/^([\s\S]*?)```[^\n`]*\n([\s\S]*?)\n?```\s*$/);
  if (!match || text.split('```').length !== 3) return text;
  return match[2].trim() ? match[2] : match[1].trim();
}

export const ActivityOutput: React.FC<Props> = ({ input, result, pendingText }) => {
  const output = useMemo(() => unwrapFencedOutput((result ? String(result) : '')
    .replace(ANSI_ESCAPE_PATTERN, '')), [result]);

  return (
    <div className="[&_.markdown-body_pre]:my-0 [&_.markdown-body_pre]:border-0
        [&_.markdown-body_pre]:rounded-none [&_.markdown-body_pre]:bg-transparent [&_.markdown-body_pre]:overflow-visible
        [&_.markdown-body_pre]:p-0 [&_.markdown-body_pre_code]:p-0">
      <div className="break-words">{input}</div>
      {output ? (
        <div className="mt-4">{output.startsWith('```') ? (<MarkdownMessage content={output} enableCodeCopy={false} />) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-sm m-0 bg-transparent">{output}</pre>
          )}
        </div>
      ) : pendingText ? (<div className="mt-4 italic">{pendingText}</div>) : null}
    </div>
  );
};
