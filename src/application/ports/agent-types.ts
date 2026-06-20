export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // JSON schema describing tool parameters
}

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; name: string; content: string };

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string | AgentContentBlock[];
}

export interface AgentTurn {
  stopReason: 'end_turn' | 'tool_use';
  content: AgentContentBlock[];
}

export interface IAgentParams {
  maxTokens: number;
  tools: AgentToolDefinition[];
  messages: AgentMessage[];
  system?: string;
}
