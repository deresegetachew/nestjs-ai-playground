import { Observable } from 'rxjs';
import { IAgentParams, AgentTurn } from './agent-types';
import { AIModel } from '../../domain/models/ai-model.value-object';

export interface AIClient {
  /**
   * Returns a list of models supported by this client.
   */
  getAvailableModels(): Promise<AIModel[]>;

  createMessage(params: IAgentParams): {
    chunks$: Observable<string>;
    turn$: Promise<AgentTurn>;
  };
}

export const AIClient = Symbol('AIClient');
