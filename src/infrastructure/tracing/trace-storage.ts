import { AsyncLocalStorage } from 'node:async_hooks';
import { setTraceDelegate, TraceContextDelegate } from '../../application/utils/trace-context';

export interface TraceStore {
  traceId: string;
  agentName?: string;
}

export const traceStorage = new AsyncLocalStorage<TraceStore>();

export const nodeTraceDelegate: TraceContextDelegate = {
  run<T>(traceId: string, callback: () => T, agentName?: string): T {
    return traceStorage.run({ traceId, agentName }, callback);
  },
  getTraceId(): string | undefined {
    const store = traceStorage.getStore();
    return store?.traceId;
  },
  getAgentName(): string | undefined {
    const store = traceStorage.getStore();
    return store?.agentName;
  },
  setAgentName(agentName: string): void {
    const store = traceStorage.getStore();
    if (store) {
      store.agentName = agentName;
    }
  },
};

// Register Node.js-specific trace storage delegate
setTraceDelegate(nodeTraceDelegate);
