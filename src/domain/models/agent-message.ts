export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  // Gemini thinking mode attaches an opaque signature to each function call that
  // must be echoed back verbatim in subsequent turns. Other vendors ignore this field.
  thoughtSignature?: string;
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
