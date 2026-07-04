import { RoutingDecision, AgentKey } from './agent-config.interface';

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON schema describing tool parameters
}

import {
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  AgentContentBlock,
  MessageRole,
  AgentMessage,
} from '../../domain/models/agent-message';

export type {
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  AgentContentBlock,
  MessageRole,
  AgentMessage,
};

export class AgentTurn {
  constructor(
    public readonly stopReason: 'end_turn' | 'tool_use',
    public readonly content: AgentContentBlock[],
    public readonly usage?: { inputTokens: number; outputTokens: number },
  ) {}

  static from(raw: {
    stopReason: 'end_turn' | 'tool_use';
    content: AgentContentBlock[];
    usage?: { inputTokens: number; outputTokens: number };
  }): AgentTurn {
    return new AgentTurn(raw.stopReason, raw.content, raw.usage);
  }

  get isEndTurn(): boolean {
    return this.stopReason === 'end_turn';
  }

  get isToolUse(): boolean {
    return this.stopReason === 'tool_use';
  }

  get reply(): string {
    const textBlock = this.content.find(
      (b): b is TextBlock => b.type === 'text',
    );
    return textBlock ? textBlock.text : '';
  }

  get toolUses(): ToolUseBlock[] {
    return this.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
  }
}

export interface IAgentParams {
  maxTokens: number;
  system?: string;
  tools: AgentToolDefinition[];
  messages: AgentMessage[];
  model?: string;
  temperature?: number;
  toolChoice?: { toolName: string };
}

export enum LlmModel {
  GeminiFlash = 'gemini-3.5-flash',
  GeminiFlashLite = 'gemini-3.1-flash-lite',
  GeminiPro = 'gemini-2.5-pro',
}

export type AgentStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'observation'; content: string }
  | { type: 'warning'; text: string }
  | { type: 'error'; text: string }
  | { type: 'turn_completed'; isEnd: boolean }
  | { type: 'message_added'; message: AgentMessage }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number }
  | { type: 'routing_decision' } & RoutingDecision
  | { type: 'specialist_start'; specialist: AgentKey };
