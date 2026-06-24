export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON schema describing tool parameters
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  name: string;
  content: string;
}

export type AgentContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type MessageRole = 'user' | 'assistant';

export interface AgentMessage {
  role: MessageRole;
  content: string | AgentContentBlock[];
}

export class AgentTurn {
  constructor(
    public readonly stopReason: 'end_turn' | 'tool_use',
    public readonly content: AgentContentBlock[],
  ) {}

  static from(raw: {
    stopReason: 'end_turn' | 'tool_use';
    content: AgentContentBlock[];
  }): AgentTurn {
    return new AgentTurn(raw.stopReason, raw.content);
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
}

export type AgentStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'observation'; content: string }
  | { type: 'warning'; text: string }
  | { type: 'error'; text: string }
  | { type: 'turn_completed'; isEnd: boolean };
