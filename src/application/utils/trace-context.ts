export interface TraceContextDelegate {
  run<T>(traceId: string, callback: () => T, agentName?: string): T;
  getTraceId(): string | undefined;
  getAgentName(): string | undefined;
  setAgentName(agentName: string): void;
}

let delegate: TraceContextDelegate = {
  run: <T>(_, callback: () => T) => callback(),
  getTraceId: () => undefined,
  getAgentName: () => undefined,
  setAgentName: () => {},
};

export function setTraceDelegate(d: TraceContextDelegate): void {
  delegate = d;
}

export function runWithTrace<T>(traceId: string, callback: () => T, agentName?: string): T {
  return delegate.run(traceId, callback, agentName);
}

export function getTraceId(): string | undefined {
  return delegate.getTraceId();
}

export function getAgentName(): string | undefined {
  return delegate.getAgentName();
}

export function setAgentName(agentName: string): void {
  delegate.setAgentName(agentName);
}
