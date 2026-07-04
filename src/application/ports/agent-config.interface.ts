import { LlmModel } from './agent-types';
import { Tool } from './tool.interface';

export enum AgentKey {
  Billing = 'billing',
  TechSupport = 'tech_support',
  Account = 'account',
}

export interface AgentConfig {
  readonly key: AgentKey;
  readonly systemPrompt: string;
  readonly tools: Tool[];
  readonly maxTurns: number;
  readonly model: LlmModel;
  readonly temperature: number;
}

export interface RoutingDecision {
  readonly specialists: AgentKey[];
  readonly reason: string;
}

export const SUPPORT_DESK_AGENT_CONFIGS = 'SUPPORT_DESK_AGENT_CONFIGS';
