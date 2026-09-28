import { useLayoutEffect, useRef, memo, useState, useMemo, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Message, RichContentBlock, ExploringBlock, ToolCallBlock, PlanBlock, AgentOption } from '../../types/chat';
import { UserMessage, formatPromptTime } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ChatLoadingIndicator } from './ChatLoadingIndicator';
import { Tooltip } from './shared/Tooltip';
import { Button } from '../ui/Button';

const BOTTOM_PIN_THRESHOLD_PX = 10;
const READ_ACK_THRESHOLD_PX = 48;
const EARLIER_PROMPTS_BATCH_SIZE = 20;

function promptPreview(message: Message): string {
  const blocks = message.blocks?.length ? message.blocks : message.contentBlocks;
  let text = message.content.slice(0, 161);
  if (blocks?.length) {
    text = '';
    for (const block of blocks) {
      const part = block.type === 'text' ? block.text : block.type === 'image' ? ' [image] ' : '';
      text += part.slice(0, 161 - text.length);
      if (text.length > 160) break;
    }
  }
  const preview = text.slice(0, 160).replace(/\s+/g, ' ').trim();
  if (preview || !blocks?.length) return preview + (text.length > 160 ? '…' : '');
  const attachment = blocks.find((block) => block.type === 'file' || block.type === 'code_ref');
  if (attachment?.type === 'file' || attachment?.type === 'code_ref') return attachment.name;
  return 'Attachment';
}

function PromptTooltip({ message, number }: { message: Message; number: number }) {
  const time = formatPromptTime(message.timestamp);
  return (
    <>
      <div className="text-xs text-foreground-secondary">#{number}{time && ` · ${time}`}</div>
      <div className="mt-1">{promptPreview(message)}</div>
    </>
  );
}

function countUserMessages(messages: Message[], endExclusive: number): number {
  let count = 0;
  for (let i = 0; i < endExclusive; i++) {
    if (messages[i].role === 'user') count++;
  }
  return count;
}

function expandCutoffByPromptCount(messages: Message[], cutoffIndex: number, promptCount: number): number {
  if (promptCount <= 0 || cutoffIndex <= 0) return cutoffIndex;

  let remainingPrompts = promptCount;
  let nextCutoffIndex = cutoffIndex;

  while (nextCutoffIndex > 0 && remainingPrompts > 0) {
    nextCutoffIndex--;
    if (messages[nextCutoffIndex].role === 'user') {
      remainingPrompts--;
    }
  }

  return nextCutoffIndex;
}

interface MessageListProps {
  footer?: ReactNode;
  messages: Message[];
  promptNavigationHoverOnly: boolean;
  onImageClick: (src: string) => void;
  onAtBottomChange?: (isAtBottom: boolean) => void;
  onCanMarkReadChange?: (canMarkRead: boolean) => void;
  isSending?: boolean;
  status?: string;
  agentName?: string;
  agentIconPath?: string;
  availableAgents: AgentOption[];
  isHistoryReplaying?: boolean;
  onForkFromMessage?: (messageId: string) => void;
  scrollToBottomOnInitialMessages?: boolean;
}

function MessageList({ 
  footer,
  messages,
  promptNavigationHoverOnly,
  onImageClick,
  onAtBottomChange,
  onCanMarkReadChange,
  isSending,
  status,
  agentName,
  agentIconPath,
  availableAgents,
  isHistoryReplaying = false,
  onForkFromMessage,
  scrollToBottomOnInitialMessages = false
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationScrollIntentRef = useRef(false);
  const promptElementsRef = useRef(new Map<string, HTMLDivElement>());
  const pendingPromptIdRef = useRef<string | null>(null);
  const registerPromptElement = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) promptElementsRef.current.set(id, element);
    else promptElementsRef.current.delete(id);
  }, []);
  const followBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const atBottomChangeRef = useRef(onAtBottomChange);
  const canMarkReadChangeRef = useRef(onCanMarkReadChange);
  const lastAtBottomRef = useRef(true);
  const lastCanMarkReadRef = useRef(true);
  const prevIsReplaying = useRef(isHistoryReplaying);
  const prevIsSendingForScroll = useRef(isSending);
  const prevIsSendingForCollapse = useRef(isSending);
  const initialMessagesScrolledRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const [revealedPromptCount, setRevealedPromptCount] = useState(0);
  const [hasNavigationRoom, setHasNavigationRoom] = useState(false);
  const [navigationEdges, setNavigationEdges] = useState({ atTop: true, atBottom: true });

  useEffect(() => {
    atBottomChangeRef.current = onAtBottomChange;
  }, [onAtBottomChange]);

  useEffect(() => {
    canMarkReadChangeRef.current = onCanMarkReadChange;
  }, [onCanMarkReadChange]);

  const getDistanceFromBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  const publishViewportState = useCallback((el: HTMLDivElement) => {
    const distanceFromBottom = getDistanceFromBottom(el);
    const isAtBottom = distanceFromBottom < BOTTOM_PIN_THRESHOLD_PX;
    const canMarkRead = distanceFromBottom < READ_ACK_THRESHOLD_PX;

    if (lastAtBottomRef.current !== isAtBottom) {
      lastAtBottomRef.current = isAtBottom;
      atBottomChangeRef.current?.(isAtBottom);
    }

    if (lastCanMarkReadRef.current !== canMarkRead) {
      lastCanMarkReadRef.current = canMarkRead;
      canMarkReadChangeRef.current?.(canMarkRead);
    }
  }, []);

  const updateViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientHeight === 0) return;
    if (!isHistoryReplaying && followBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
    }
    publishViewportState(el);
  }, [isHistoryReplaying, publishViewportState]);

  useEffect(() => {
    if (isHistoryReplaying) {
      setRevealedPromptCount(0);
    }
  }, [isHistoryReplaying]);

  const { visibleMessages, hiddenCount, hiddenPromptCount } = useMemo(() => {
    if (messages.length <= 6) {
      return { visibleMessages: messages, hiddenCount: 0, hiddenPromptCount: 0 };
    }

    const SYMBOL_LIMIT = 15000;
    
    // Safely estimate block size without counting base64 media
    const getBlockSize = (block: RichContentBlock): number => {
      if (!block) return 0;
      if (['image', 'audio', 'video', 'file'].includes(block.type)) {
        return 500; // Fixed weight for media/files
      }
      if (block.type === 'code_ref') {
        return 50;
      }
      if (block.type === 'text') {
        return (block as any).text?.length || 0;
      }
      if (block.type === 'exploring') {
        const exp = block as ExploringBlock;
        return exp.entries ? JSON.stringify(exp.entries).length : 0;
      }
      if (block.type === 'tool_call') {
        const tc = block as ToolCallBlock;
        return tc.entry ? JSON.stringify(tc.entry).length : 0;
      }
      if (block.type === 'plan') {
         const plan = block as PlanBlock;
         return plan.entries ? JSON.stringify(plan.entries).length : 0;
      }
      return 0;
    };

    const getMessageSize = (msg: Message) => {
      let size = (msg.content || '').length;
      const allBlocks = [...(msg.blocks || []), ...(msg.contentBlocks || [])];
      for (const b of allBlocks) {
        size += getBlockSize(b);
      }
      return size;
    };

    let totalSize = 0;
    let cutoffIndex = 0;
    
    // Go backwards from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      // Always show at least the last 6 messages (ensures last 3 full interactions are visible)
      if (i >= messages.length - 6) {
        totalSize += getMessageSize(messages[i]);
        continue;
      }
      
      const size = getMessageSize(messages[i]);
      if (totalSize + size > SYMBOL_LIMIT) {
        cutoffIndex = i + 1;
        break;
      }
      totalSize += size;
    }

    const effectiveCutoffIndex = expandCutoffByPromptCount(messages, cutoffIndex, revealedPromptCount);

    return {
      visibleMessages: messages.slice(effectiveCutoffIndex),
      hiddenCount: effectiveCutoffIndex,
      hiddenPromptCount: countUserMessages(messages, effectiveCutoffIndex),
    };
  }, [messages, revealedPromptCount]);

  const { userPromptNumberById, prompts } = useMemo(() => {
    const numbering = new Map<string, number>();
    const prompts: Message[] = [];
    let promptNumber = 0;

    messages.forEach((message) => {
      if (message.role !== 'user') return;
      promptNumber++;
      numbering.set(message.id, promptNumber);
      prompts.push(message);
    });

    return { userPromptNumberById: numbering, prompts };
  }, [messages]);
  const previousPromptCountRef = useRef(prompts.length);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const updateNavigationRoom = () => {
      const maxWidth = Number.parseFloat(getComputedStyle(content).maxWidth);
      const contentRect = content.getBoundingClientRect();
      const leftGutter = contentRect.left - el.getBoundingClientRect().left;
      setHasNavigationRoom(Number.isFinite(maxWidth) && contentRect.width >= maxWidth - 1 && leftGutter >= 28);
    };
    const observer = new ResizeObserver(updateNavigationRoom);
    observer.observe(el);
    updateNavigationRoom();
    return () => observer.disconnect();
  }, []);

  const showNavigation = prompts.length > 1 && !isHistoryReplaying;
  const navigationHiddenUntilHover = !hasNavigationRoom || promptNavigationHoverOnly;

  const updateNavigationEdges = useCallback(() => {
    const el = navigationRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setNavigationEdges((previous) =>
      previous.atTop === atTop && previous.atBottom === atBottom ? previous : { atTop, atBottom }
    );
  }, []);

  const markNavigationScrollIntent = () => {
    const el = navigationRef.current;
    if (el && el.scrollHeight > el.clientHeight) navigationScrollIntentRef.current = true;
  };

  useLayoutEffect(() => {
    const el = navigationRef.current;
    if (!el) {
      navigationScrollIntentRef.current = false;
      return;
    }
    const syncNavigation = () => {
      if (!navigationScrollIntentRef.current) el.scrollTop = el.scrollHeight;
      updateNavigationEdges();
    };
    const observer = new ResizeObserver(syncNavigation);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    syncNavigation();
    return () => observer.disconnect();
  }, [showNavigation, prompts.length, updateNavigationEdges]);

  const navigationFade = navigationEdges.atTop
    ? navigationEdges.atBottom
      ? ''
      : '[mask-image:linear-gradient(to_bottom,black_calc(100%-12px),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-12px),transparent)]'
    : navigationEdges.atBottom
      ? '[mask-image:linear-gradient(to_bottom,transparent,black_12px)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_12px)]'
      : '[mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-12px),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-12px),transparent)]';

  const scrollToPrompt = (id: string) => {
    const el = containerRef.current;
    const target = promptElementsRef.current.get(id);
    if (!el || !target) return;
    el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top;
    lastScrollTopRef.current = el.scrollTop;
    publishViewportState(el);
  };

  const handlePromptClick = (message: Message, promptNumber: number) => {
    handleUserIntentScrollUp();
    if (promptElementsRef.current.has(message.id)) {
      scrollToPrompt(message.id);
      return;
    }
    pendingPromptIdRef.current = message.id;
    setRevealedPromptCount((count) => count + hiddenPromptCount - promptNumber + 1);
  };

  useLayoutEffect(() => {
    const id = pendingPromptIdRef.current;
    if (!id || !promptElementsRef.current.has(id)) return;
    pendingPromptIdRef.current = null;
    scrollToPrompt(id);
  }, [visibleMessages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop > lastScrollTopRef.current && getDistanceFromBottom(el) < BOTTOM_PIN_THRESHOLD_PX) {
      followBottomRef.current = true;
    }
    lastScrollTopRef.current = el.scrollTop;
    publishViewportState(el);
  };

  const handleUserIntentScrollUp = () => {
    followBottomRef.current = false;
    lastScrollTopRef.current = containerRef.current?.scrollTop ?? 0;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const left = el.getBoundingClientRect().left + el.clientLeft;
    if (e.target === el && (e.clientX < left || e.clientX >= left + el.clientWidth)) {
      handleUserIntentScrollUp();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (footerRef.current?.contains(e.target as Node)) return;
    if (e.deltaY < 0) {
      handleUserIntentScrollUp();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (footerRef.current?.contains(e.target as Node)) return;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    // Moving finger down (currentY > touchStartYRef.current) scrolls the content UP
    if (currentY > touchStartYRef.current) {
      handleUserIntentScrollUp();
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (footerRef.current?.contains(e.target as Node)) return;
    if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) {
      handleUserIntentScrollUp();
    }
  };

  const handleExpand = () => {
    handleUserIntentScrollUp();
    const el = containerRef.current;
    if (!el) {
      setRevealedPromptCount((prev) => prev + EARLIER_PROMPTS_BATCH_SIZE);
      return;
    }

    const previousScrollHeight = el.scrollHeight;
    const previousScrollTop = el.scrollTop;

    setRevealedPromptCount((prev) => prev + EARLIER_PROMPTS_BATCH_SIZE);

    // After state update and re-render, adjust scroll to keep relative position
    requestAnimationFrame(() => {
      const newScrollHeight = el.scrollHeight;
      el.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
    });
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = getDistanceFromBottom(el);
    const isAtBottom = distanceFromBottom < BOTTOM_PIN_THRESHOLD_PX;
    const canMarkRead = distanceFromBottom < READ_ACK_THRESHOLD_PX;
    lastAtBottomRef.current = isAtBottom;
    followBottomRef.current = isAtBottom;
    lastScrollTopRef.current = el.scrollTop;
    lastCanMarkReadRef.current = canMarkRead;
    atBottomChangeRef.current?.(isAtBottom);
    canMarkReadChangeRef.current?.(canMarkRead);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateViewport]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const newPrompt = prompts.length > previousPromptCountRef.current;
    previousPromptCountRef.current = prompts.length;

    if (
      scrollToBottomOnInitialMessages &&
      !initialMessagesScrolledRef.current &&
      messages.length > 0 &&
      !isHistoryReplaying
    ) {
      initialMessagesScrolledRef.current = true;
      followBottomRef.current = true;
      updateViewport();
      return;
    }

    const historyJustFinished = prevIsReplaying.current && !isHistoryReplaying;
    const sendingJustStarted = !prevIsSendingForScroll.current && isSending;
    if (historyJustFinished || sendingJustStarted || (newPrompt && !isHistoryReplaying)) {
      followBottomRef.current = true;
    }

    updateViewport();
    prevIsReplaying.current = isHistoryReplaying;
    prevIsSendingForScroll.current = isSending;
  }, [messages, prompts.length, revealedPromptCount, isHistoryReplaying, isSending, scrollToBottomOnInitialMessages, updateViewport]);

  useEffect(() => {
    const wasSending = prevIsSendingForCollapse.current;
    prevIsSendingForCollapse.current = isSending;

    if (!wasSending || isSending || isHistoryReplaying || !followBottomRef.current) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      return;
    }

    setRevealedPromptCount(0);
  }, [messages, isSending, isHistoryReplaying]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {isHistoryReplaying && messages.length === 0 && status === 'initializing' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-foreground-secondary text-sm">
            {`Connect to ${agentName || 'agent'}...`}
          </div>
        </div>
      )}
      {showNavigation && (
        <nav
          ref={navigationRef}
          aria-label="Conversation prompts"
          onScroll={updateNavigationEdges}
          onWheel={markNavigationScrollIntent}
          onTouchMove={markNavigationScrollIntent}
          onKeyDown={(event) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
              markNavigationScrollIntent();
            }
          }}
          className={`absolute top-[45px] bottom-[45px] z-30 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${hasNavigationRoom ? 'left-[4px] w-[20px]' : 'left-0 w-[12px]'} ${navigationHiddenUntilHover ? 'opacity-0 transition-opacity duration-75 hover:duration-200 hover:opacity-100 hover:delay-200 focus-within:opacity-100 focus-within:delay-0' : ''} ${navigationFade}`}
        >
          <div className="flex min-h-full flex-col items-center justify-center">
            {prompts.map((message, index) => (
              <Tooltip
                key={message.id}
                placement="right"
                content={<PromptTooltip message={message} number={index + 1} />}
                contentClassName="max-w-[min(280px,calc(100vw-48px))]"
              >
                <button
                  type="button"
                  aria-label={`Go to prompt ${index + 1}`}
                  onClick={() => handlePromptClick(message, index + 1)}
                  className={`group flex h-[8px] shrink-0 cursor-pointer items-center justify-center rounded-sm border border-transparent focus-visible:border-[var(--ide-Button-default-focusColor)] ${hasNavigationRoom ? 'w-[20px]' : 'w-[12px]'}`}
                >
                  <span className="h-[2px] w-[6px] bg-foreground-secondary opacity-60 group-hover:opacity-100" />
                </button>
              </Tooltip>
            ))}
          </div>
        </nav>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        className="relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto scroll-auto [overflow-anchor:none] px-4 opacity-100 transition-opacity duration-300"
      >
      <div ref={contentRef} className="mx-auto min-h-full w-full max-w-app-content flex flex-col">
        <div className="flex flex-1 flex-col pb-12 pt-[calc(1.5rem+var(--content-top-inset,0px))]">
        
        {hiddenCount > 0 && !isHistoryReplaying && (
          <div className="flex justify-center mb-12">
            <Button onClick={handleExpand} variant="secondary">
              Show {Math.min(hiddenPromptCount, EARLIER_PROMPTS_BATCH_SIZE)} earlier message{Math.min(hiddenPromptCount, EARLIER_PROMPTS_BATCH_SIZE) > 1 ? 's' : ''}
            </Button>
          </div>
        )}

        {visibleMessages.map((message, index) => {
          const isAssistant = message.role === 'assistant';
          const isLast = index === visibleMessages.length - 1;

          if (isAssistant) {
            const resolvedAgentIconPath = message.agentId
              ? availableAgents.find((agent) => agent.id === message.agentId)?.iconPath
              : undefined;

            return (
              <AssistantMessage 
                key={message.id} 
                message={message} 
                onImageClick={onImageClick} 
                hasFollowingMessage={!isLast}
                agentIconPath={resolvedAgentIconPath}
                isActivePrompt={Boolean(isSending) && isLast && !message.metaComplete && status === 'prompting'}
                onFork={message.metaComplete && onForkFromMessage ? () => onForkFromMessage(message.id) : undefined}
              />
            );
          }

          return (
            <UserMessage
              key={message.id}
              message={message}
              onImageClick={onImageClick}
              promptNumber={userPromptNumberById.get(message.id)}
              onElementChange={registerPromptElement}
            />
          );
        })}

        {visibleMessages.length === 0 && !isSending && !isHistoryReplaying && agentIconPath && (
          <div className="pointer-events-none absolute inset-x-0 top-[35%] flex -translate-y-1/2 justify-center">
            <img src={agentIconPath}
              className="w-14 h-14 opacity-60 select-none pointer-events-none"
            />
          </div>
        )}

        {isSending && !isHistoryReplaying && (
          <div className="flex justify-start mb-8">
            <ChatLoadingIndicator status={status} agentName={agentName} />
          </div>
        )}
        </div>
        {footer && (
          <div ref={footerRef} className="sticky bottom-0 z-20 flex shrink-0 flex-col pt-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 bg-background shadow-[0_4px_0_0_var(--ide-Panel-background)]">
              <div className="absolute inset-x-0 bottom-full h-8 bg-gradient-to-b from-transparent to-background" />
            </div>
            <div className="relative flex flex-col">
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
}

export default memo(MessageList);
