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
