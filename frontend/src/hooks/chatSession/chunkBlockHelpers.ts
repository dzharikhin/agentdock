import { ContentChunk, ExploringBlock, Message, RichContentBlock } from '../../types/chat';
import { safeParseJson } from '../../utils/toolCallUtils';

export function isExploringChunk(chunk: ContentChunk): boolean {
  // Stored tool_call_update events carry kind only inside the raw payload.
  const kind = chunk.toolKind || safeParseJson(chunk.toolRawJson).kind;
  return !['edit', 'delete', 'move', 'think', 'task'].includes(kind);
}

export function stripTransferredContextForDisplay(
  text: string,
  role: 'user' | 'assistant',
  isReplay?: boolean
): string {
  if (!isReplay || role !== 'user') return text;

  const markerStart = text.indexOf('[TRANSFERRED CONTEXT]');
  const markerEnd = text.indexOf('[/TRANSFERRED CONTEXT]');
  if (markerStart < 0 || markerEnd < 0 || markerEnd < markerStart) {
    return text;
  }

  const markerUserRequest = text.indexOf('[USER REQUEST]', markerEnd + '[/TRANSFERRED CONTEXT]'.length);
  if (markerUserRequest < 0) {
    return text;
  }

  return text.slice(markerUserRequest + '[USER REQUEST]'.length).trimStart();
}

export function getBlocks(msg: Message): RichContentBlock[] {
  return msg.role === 'assistant'
    ? [...(msg.contentBlocks || [])]
    : [...(msg.blocks || [])];
}

export function setBlocks(msg: Message, blocks: RichContentBlock[]): Message {
  if (msg.role === 'assistant') {
    return { ...msg, contentBlocks: [...blocks] };
  }
  return { ...msg, blocks: [...blocks] };
}

export function failPendingToolStatuses(blocks: RichContentBlock[] | undefined): RichContentBlock[] | undefined {
  if (!blocks) return blocks;

  let changed = false;
  const nextBlocks = blocks.map((block) => {
    if (block.type === 'tool_call') {
      const status = (block.entry.status || '').toLowerCase();
      if (!status || status === 'pending' || status === 'running' || status === 'in_progress' || status === 'active') {
        changed = true;
        return {
          ...block,
          entry: {
            ...block.entry,
            status: 'failed',
          }
        };
      }
      return block;
    }

    if (block.type === 'exploring') {
      let entriesChanged = false;
      const entries = block.entries.map((entry) => {
        const status = (entry.status || '').toLowerCase();
        if (!status || status === 'pending' || status === 'running' || status === 'in_progress' || status === 'active') {
          entriesChanged = true;
          return { ...entry, status: 'failed' };
        }
        return entry;
      });

      if (entriesChanged) {
        changed = true;
        return { ...block, entries };
      }
    }

    return block;
  });

  return changed ? nextBlocks : blocks;
}

export function closeStreamingExploring(blocks: RichContentBlock[]) {
  const last = blocks[blocks.length - 1];
  if (last && last.type === 'exploring' && (last as ExploringBlock).isStreaming) {
    blocks[blocks.length - 1] = { ...last, isStreaming: false } as ExploringBlock;
  }
}
