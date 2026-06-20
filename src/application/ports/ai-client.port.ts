import { Observable } from 'rxjs';
import { IAgentParams, AgentTurn } from './agent-types';
import { AIModel } from '../../domain/models/ai-model.value-object';

export interface AIClient {
  /**
   * Returns the underlying AI vendor client instance (e.g., GoogleGenAI, OpenAI).
   */
  getClient(): any;

  /**
   * Returns a list of models supported by this client.
   */
  getAvailableModels(): Promise<AIModel[]>;

  /**
   * Generates a complete text response.
   */
  message(prompt: string): Promise<string>;

  /**
   * Streams the text response.
   */
  streamMessage(prompt: string): Observable<string>;

  /**
   * Generates a structured agent turn (for tool-calling and ReAct loops).
   */
  createMessage(params: IAgentParams): Promise<AgentTurn>;
}

export const AIClient = Symbol('AIClient');
