import { ChatAttachment, RichContentBlock } from '../../types/chat';

export interface QueuedPrompt extends QueuePromptDraft {
  id: string;
}

export interface QueuePromptDraft {
  scheduledAt?: number;
  text: string;
  composerText: string;
  blocks: RichContentBlock[];
  attachments: ChatAttachment[];
}
