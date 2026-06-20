import { AgentToolDefinition } from './agent-types';

export interface Tool<TInput = any, TOutput = any> extends AgentToolDefinition {
  execute(input: TInput): Promise<TOutput>;
}
