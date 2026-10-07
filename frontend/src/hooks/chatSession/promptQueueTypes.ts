import { ChatAttachment, MessageConfigOption, RichContentBlock } from '../../types/chat';

export interface QueuedPrompt extends QueuePromptDraft {
  id: string;
}

export interface QueuePromptDraft {
  agentId: string;
  agentName: string;
  configValues: Record<string, string>;
  configOptions: MessageConfigOption[];
  scheduledAt?: number;
  text: string;
  composerText: string;
  blocks: RichContentBlock[];
  attachments: ChatAttachment[];
}
