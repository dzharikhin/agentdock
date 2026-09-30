import { useState } from 'react';
import AttachmentBar from './input/AttachmentBar';
import SlashCommandMenu from './input/SlashCommandMenu';
import FileMentionMenu from './input/FileMentionMenu';
import { ChatInputControls } from './input/ChatInputControls';
import { ChatInputEditor } from './input/ChatInputEditor';
import { ChatInputProps } from './input/chatInputState';
import { useChatInputController } from './input/useChatInputController';
import { VoiceInputButton } from '../audio/VoiceInputButton';

export default function ChatInput(props: ChatInputProps) {
  const [resizeHovered, setResizeHovered] = useState(false);
  const {
    conversationId,
    contextTokensUsed,
    contextWindowSize,
    inputValue,
    composerLoadRevision = 0,
    onInputChange,
    onSend,
    scheduleEnabled = false,
    onScheduleModeChange,
    queueError,
    onStop,
    isSending,
    promptQueueEnabled,
    agentOptions,
    selectedAgentId,
    onAgentChange,
    selectedModelId,
    onModelChange,
    usageSessionKey,
    status,
    modeOptions,
    selectedModeId,
    onModeChange,
    reasoningEffortOptions,
    selectedReasoningEffortId,
    onReasoningEffortChange,
    additionalConfigOptions,
    onConfigOptionChange,
    approvalMode,
    onApprovalModeChange,
    hasSelectedAgent,
    attachments,
    onAttachmentsChange,
    onImageClick,
    onHeightChange,
    onResizeStart,
    isResizing = false,
    isActive = false
  } = props;

  const {
    editorContainerRef,
    inputRootRef,
    slashMenuRef,
    fileMenuRef,
    composerRevision,
    sendMode,
    setSendMode,
    plusMenuOptions,
    isDragOver,
    isSlashMenuOpen,
    slashCommands,
    slashMenuLayout,
    highlightedIndex,
    setHighlightedIndex,
    applyCommand,
    isFileMenuOpen,
    mentionedFiles,
    fileMenuLayout,
    fileHighlightedIndex,
    setFileHighlightedIndex,
    applyFile,
    customHeight,
    insertText,
    agentSlashItems,
    promptLibrarySlashItems,
    handleOpenFile,
    combinedHandleKeyDownCapture,
    handleInsertSlashItem,
    setLexicalEditor,
  } = useChatInputController(props);

  return (
    <div
      ref={inputRootRef}
      style={{ height: customHeight ? `${customHeight}px` : undefined }}
      className="relative flex-shrink-0 pb-[12px] pt-1 [container-type:inline-size] [container-name:chat-input]">
      <div className="h-full w-full flex flex-col">
        <div className={`relative flex h-full flex-col rounded-ide border border-border
          bg-background-secondary transition-all focus-within:ring-1 
          focus-within:[--tw-ring-color:color-mix(in_srgb,var(--ide-Button-default-focusColor)_70%,transparent)] 
          ${resizeHovered || isResizing ? 'border-t-[var(--ide-Button-default-focusColor)]' : ''}`}>
          {onResizeStart && (
            <div
              role="separator"
              aria-label="Resize chat input"
              aria-orientation="horizontal"
              onMouseDown={onResizeStart}
              onMouseEnter={() => setResizeHovered(true)}
              onMouseLeave={() => setResizeHovered(false)}
              className="absolute -top-px inset-x-0 -translate-y-1/2 h-4 z-10 cursor-row-resize select-none"
            />
          )}

          {queueError && <div role="alert" className="px-3 pt-2 text-ide-small text-error">{queueError}</div>}
          <AttachmentBar
            attachments={attachments}
            onRemove={(id) => onAttachmentsChange(attachments.filter(a => a.id !== id))}
            onImageClick={onImageClick}
          />

          <ChatInputEditor
            conversationId={conversationId}
            composerRevision={composerRevision}
            editorContainerRef={editorContainerRef}
            inputValue={inputValue}
            composerLoadRevision={composerLoadRevision}
            attachments={attachments}
            sendMode={sendMode}
            isActive={isActive}
            isDragOver={isDragOver}
            isSlashMenuOpen={isSlashMenuOpen}
            onInputChange={onInputChange}
            onAttachmentsChange={onAttachmentsChange}
            onImageClick={onImageClick}
            onOpenFile={handleOpenFile}
            onHeightChange={onHeightChange}
            onSend={onSend}
            onKeyDownCapture={combinedHandleKeyDownCapture}
            onEditorReady={setLexicalEditor}
          />

          <ChatInputControls
            containerRef={inputRootRef}
            sendMode={sendMode}
            setSendMode={setSendMode}
            plusMenuOptions={plusMenuOptions}
            conversationId={conversationId}
            agentOptions={agentOptions}
            selectedAgentId={selectedAgentId}
            selectedModelId={selectedModelId}
            selectedModeId={selectedModeId}
            modeOptions={modeOptions}
            selectedReasoningEffortId={selectedReasoningEffortId}
            reasoningEffortOptions={reasoningEffortOptions}
            additionalConfigOptions={additionalConfigOptions}
            approvalMode={approvalMode}
            isSending={isSending}
            hasSelectedAgent={hasSelectedAgent}
            status={status}
            usageSessionKey={usageSessionKey}
            contextTokensUsed={contextTokensUsed}
            contextWindowSize={contextWindowSize}
            inputValue={inputValue}
            voiceInputButton={
              <VoiceInputButton
                conversationId={conversationId}
                insertText={insertText}
              />
            }
            agentSlashItems={agentSlashItems}
            promptLibrarySlashItems={promptLibrarySlashItems}
            handleInsertSlashItem={handleInsertSlashItem}
            onAgentChange={onAgentChange}
            onModelChange={onModelChange}
            onModeChange={onModeChange}
            onReasoningEffortChange={onReasoningEffortChange}
            onConfigOptionChange={onConfigOptionChange}
            onApprovalModeChange={onApprovalModeChange}
            onSend={onSend}
            scheduleEnabled={scheduleEnabled}
            onScheduleModeChange={onScheduleModeChange}
            hasAttachments={attachments.length > 0}
            onStop={onStop}
            promptQueueEnabled={promptQueueEnabled}
          />
        </div>
      </div>
      {isSlashMenuOpen && slashMenuLayout && (
        <SlashCommandMenu
          commands={slashCommands}
          highlightedIndex={highlightedIndex}
          layout={slashMenuLayout}
          menuRef={slashMenuRef}
          onHover={setHighlightedIndex}
          onSelect={applyCommand}
        />
      )}
      {isFileMenuOpen && fileMenuLayout && (
        <FileMentionMenu
          files={mentionedFiles}
          highlightedIndex={fileHighlightedIndex}
          layout={fileMenuLayout}
          menuRef={fileMenuRef}
          onHover={setFileHighlightedIndex}
          onSelect={applyFile}
        />
      )}
    </div>
  );
}
