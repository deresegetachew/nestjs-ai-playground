import { IAgentParams, AgentTurn, AgentMessage } from './agent-types';
import { AIModel } from '../../domain/models/ai-model.value-object';

export interface AIClient {
  /**
   * Returns a list of models supported by this client.
   */
  getAvailableModels(): Promise<AIModel[]>;

  /**
   * Creates a streaming message completion request.
   * Uses a split-stream pattern to handle both real-time text delivery and final metadata:
   * - `chunks`: An AsyncIterable yielding real-time text tokens as they arrive from the model.
   * - `chunks`: An AsyncIterable yielding real-time text tokens as they arrive from the model.
   * - `turnPromise`: A Promise that resolves to the final structured AgentTurn (containing metadata,
   *   token usage statistics, and tool calls) once the stream ends.
   */
  createMessage(params: IAgentParams): {
    chunks: AsyncIterable<string>;
    turnPromise: Promise<AgentTurn>;
  };

  readonly defaultModel?: string;

  countTokens(messages: AgentMessage[], model?: string): Promise<number>;
}

export const AIClient = Symbol('AIClient');
