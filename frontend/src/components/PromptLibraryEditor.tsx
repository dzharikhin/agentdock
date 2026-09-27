import { useRef } from 'react';
import type { ChatAttachment } from '../types/chat';
import { openFile } from '../utils/openFile';
import { ChatInputEditor } from './chat/input/ChatInputEditor';
import AttachmentBar from './chat/input/AttachmentBar';

interface PromptLibraryEditorProps {
  value: string;
  attachments: ChatAttachment[];
  onChange: (value: string) => void;
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  onImageClick: (src: string) => void;
}

export function PromptLibraryEditor({
  value,
  attachments,
  onChange,
  onAttachmentsChange,
  onImageClick,
}: PromptLibraryEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex h-[206px] flex-col rounded-[4px] border border-[var(--ide-Button-startBorderColor)] bg-background-secondary focus-within:border-[var(--ide-Button-default-focusColor)]">
      <AttachmentBar
        attachments={attachments}
        onRemove={(id) => onAttachmentsChange(attachments.filter((attachment) => attachment.id !== id))}
        onImageClick={onImageClick}
      />
      <ChatInputEditor
        conversationId="prompt-library"
        composerRevision={0}
        editorContainerRef={editorContainerRef}
        inputValue={value}
        composerLoadRevision={1}
        attachments={attachments}
        sendMode="enter"
        isActive={false}
        isDragOver={false}
        isSlashMenuOpen={false}
        onInputChange={onChange}
        onAttachmentsChange={onAttachmentsChange}
        onImageClick={onImageClick}
        onOpenFile={openFile}
        placeholder="Type a prompt"
      />
    </div>
  );
}
