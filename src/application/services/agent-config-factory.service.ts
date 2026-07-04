import { Inject, Injectable } from '@nestjs/common';
import { AgentConfig, AgentKey, SUPPORT_DESK_AGENT_CONFIGS } from '../ports/agent-config.interface';

@Injectable()
export class AgentConfigFactory {
  private readonly registry: Map<AgentKey, AgentConfig>;

  constructor(@Inject(SUPPORT_DESK_AGENT_CONFIGS) configs: AgentConfig[]) {
    this.registry = new Map(configs.map((c) => [c.key, c]));
  }

  get(key: AgentKey): AgentConfig {
    const config = this.registry.get(key);
    if (!config) throw new Error(`No agent config registered for key: ${key}`);
    return config;
  }
}
