import { Tool } from '../ports/tool.interface';
import { AgentMessage } from '../ports/agent-types';

export interface ToolCallHistoryEntry {
  tool: string;
  argsHash: string;
}

export class LoopDetectionState {
  private _history: ToolCallHistoryEntry[] = [];
  private _warningInjected = false;
  private _turnsSinceWarning = 0;

  get history(): readonly ToolCallHistoryEntry[] { return this._history; }
  get warningInjected(): boolean { return this._warningInjected; }
  get turnsSinceWarning(): number { return this._turnsSinceWarning; }

  pushHistory(entry: ToolCallHistoryEntry): void {
    this._history.push(entry);
    if (this._history.length > 12) this._history.shift();
  }

  injectWarning(): void {
    this._warningInjected = true;
    this._turnsSinceWarning = 0;
  }

  incrementTurnsSinceWarning(): void { this._turnsSinceWarning++; }
  resetTurnsSinceWarning(): void { this._turnsSinceWarning = 0; }
}

export class AgentRunContext {
  readonly runId: string;
  readonly agentName: string;
  readonly runStart: number;
  readonly model: string;
  readonly temperature: number;
  readonly maxTurns: number;
  readonly toolChoice?: { toolName: string };
  readonly systemPrompt: string;
  readonly tools: readonly Tool[];
  readonly loopDetection: LoopDetectionState;

  private _turns = 0;
  private _totalInputTokens = 0;
  private _totalOutputTokens = 0;
  private _totalThoughtTurns = 0;
  private _localMessages: AgentMessage[];

  constructor(params: {
    runId: string;
    agentName: string;
    systemPrompt: string;
    tools: Tool[];
    messages: AgentMessage[];
    maxTurns: number;
    model: string;
    temperature: number;
    toolChoice?: { toolName: string };
  }) {
    this.runId = params.runId;
    this.agentName = params.agentName;
    this.runStart = Date.now();
    this.model = params.model;
    this.temperature = params.temperature;
    this.maxTurns = params.maxTurns;
    this.toolChoice = params.toolChoice;
    this.systemPrompt = params.systemPrompt;
    this.tools = params.tools;
    this.loopDetection = new LoopDetectionState();
    this._localMessages = [...params.messages];
  }

  get turns(): number { return this._turns; }
  get totalInputTokens(): number { return this._totalInputTokens; }
  get totalOutputTokens(): number { return this._totalOutputTokens; }
  get totalThoughtTurns(): number { return this._totalThoughtTurns; }
  get localMessages(): readonly AgentMessage[] { return this._localMessages; }

  incrementTurns(): void { this._turns++; }
  incrementThoughtTurns(): void { this._totalThoughtTurns++; }

  addTokens(input: number, output: number): void {
    this._totalInputTokens += input;
    this._totalOutputTokens += output;
  }

  addMessage(msg: AgentMessage): void { this._localMessages.push(msg); }

  replaceMessages(msgs: AgentMessage[]): void { this._localMessages = [...msgs]; }
}
