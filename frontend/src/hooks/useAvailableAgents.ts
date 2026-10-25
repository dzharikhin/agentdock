import { useEffect, useRef, useState } from 'react';
import { AgentOption } from '../types/chat';
import { ACPBridge } from '../utils/bridge';

export function useAvailableAgents() {
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [adaptersResolved, setAdaptersResolved] = useState(false);
  const lastStableNewTabAgentIdRef = useRef<string>('');

  useEffect(() => {
    // Earlier versions cached the adapter list here without ever reading it.
    localStorage.removeItem('agent-dock.adapters');
    const dispose = ACPBridge.onAdapters((e) => {
      const safeAdapters = Array.isArray(e.detail.adapters) ? e.detail.adapters : [];
      const stableLastUsedRunnableId = safeAdapters.find((agent) => agent.isLastUsed && agent.downloaded === true)?.id;
      if (stableLastUsedRunnableId) {
        lastStableNewTabAgentIdRef.current = stableLastUsedRunnableId;
      } else {
        const currentStable = lastStableNewTabAgentIdRef.current;
        const currentStableStatus = currentStable ? safeAdapters.find((agent) => agent.id === currentStable) : undefined;
        if (currentStableStatus?.downloadedKnown === true && currentStableStatus.downloaded !== true) {
          lastStableNewTabAgentIdRef.current = safeAdapters.find((agent) => agent.downloaded === true)?.id || '';
        } else if (!currentStable) {
          lastStableNewTabAgentIdRef.current = safeAdapters.find((agent) => agent.downloaded === true)?.id || '';
        }
      }

      setAvailableAgents(safeAdapters);
      setAdaptersResolved(true);
    });
    ACPBridge.requestAdapters();
    return dispose;
  }, []);

  return {
    availableAgents,
    adaptersResolved,
    lastStableNewTabAgentIdRef,
  };
}
