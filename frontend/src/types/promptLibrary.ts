import type { ChatAttachment } from './chat';

export interface PromptLibraryItem {
  id: string;
  name: string;
  prompt: string;
  attachments?: ChatAttachment[];
}
