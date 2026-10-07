import { Bot } from 'lucide-react';
import type { AgentOption, HistorySessionMeta } from '../types/chat';
import { formatDate } from '../utils/formatDate';
import { sanitizeSvg } from '../utils/sanitizeHtml';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Tooltip } from './chat/shared/Tooltip';
import { getAgentIcon } from './tabbar/TabIcons';
import { rowButtonClassName, rowFocusClassName, sidebarRowClassName } from './tabbar/rows';

interface EmptyStateViewProps {
  runnableAgents: AgentOption[];
  /** Agents and the history are known; until then a spinner is shown, so nothing moves once the content appears. */
  loaded: boolean;
  onStartWithAgent: (agentId: string) => void;
  onOpenManagement: () => void;
  /** For the icons of the recent chats. */
  agents: AgentOption[];
  /** Offered below the agents; none hides the list. */
  recentChats: HistorySessionMeta[];
  /** All history chats; while the list leaves some out, it links to the history. */
  historyCount: number;
  onOpenChat: (item: HistorySessionMeta) => void;
  onOpenHistory: () => void;
}

function AgentIcon({ agent }: { agent: AgentOption }) {
  if (agent.iconPath) {
    if (agent.iconPath.startsWith('<svg')) {
      return (
        <div
          className="h-8 w-8 shrink-0 text-foreground [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(agent.iconPath) }}
        />
      );
    }
    return <img src={agent.iconPath} alt="" className="h-8 w-8 shrink-0 object-contain" />;
  }

  return <Bot className="h-8 w-8 shrink-0 text-foreground-secondary" />;
}

export function EmptyStateView({
  runnableAgents,
  loaded,
  onStartWithAgent,
  onOpenManagement,
  agents,
  recentChats,
  historyCount,
  onOpenChat,
  onOpenHistory,
}: EmptyStateViewProps) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
      {!loaded ? (
        <div className="flex min-h-full items-center justify-center">
          <div className="flex items-center gap-3 text-foreground-secondary">
            <LoadingSpinner className="h-5 w-5" />
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-full w-full max-w-app-content justify-center px-4 py-8 app-wide:px-6">
          <div className="relative my-auto flex w-full flex-col items-center text-center">
            {runnableAgents.length > 0 ? (
              <>
                <div className="text-ide-medium mb-8 mx-4">Select an AI agent to start a new chat</div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  {runnableAgents.map((agent) => (
                    <Tooltip key={agent.id} content={agent.name} variant="minimal">
                      <button
                        type="button"
                        onClick={() => onStartWithAgent(agent.id)}
                        className="flex h-14 w-14 items-center justify-center rounded-xl border
                          border-border bg-background transition-all duration-150
                          hover:bg-hover focus:outline-none focus:shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)]"
                      >
                        <div className="opacity-80">
                          <AgentIcon agent={agent} />
                        </div>
                      </button>
                    </Tooltip>
                  ))}
                </div>

                {recentChats.length > 0 ? (
                  <div className="mt-12 w-[380px] max-w-full text-left text-ide-small">
                    <div className="mb-2 flex items-center gap-2 px-2">
                      Continue a chat
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {recentChats.map((item) => (
                      <div key={item.conversationId} className={`${sidebarRowClassName(false)} mb-0.5`}>
                        <button type="button" onClick={() => onOpenChat(item)} className={rowButtonClassName}>
                          {getAgentIcon(item.adapterName, agents)}
                          <span className="flex-1 truncate">{item.title}</span>
                          <span className="shrink-0 text-foreground-secondary">{formatDate(item.updatedAt)}</span>
                        </button>
                      </div>
                    ))}
                    {recentChats.length < historyCount ? (
                      <button
                        type="button"
                        data-section-opener
                        onClick={onOpenHistory}
                        className={`flex min-h-8 items-center gap-1 mt-1 px-2 text-foreground-secondary hover:text-foreground
                          ${rowFocusClassName}`}
                      >
                        View all chats
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mx-4 max-w-[340px]">
                Install at least one AI agent from{' '}
                <button
                  type="button"
                  data-section-opener
                  onClick={onOpenManagement}
                  className="rounded-[3px] text-link hover:underline focus:outline-none
                    focus-visible:shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)]"
                >
                  Service Providers
                </button>{' '}
                to start a new chat.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
