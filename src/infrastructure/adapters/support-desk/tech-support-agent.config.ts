import { Inject, Injectable } from '@nestjs/common';
import { AgentConfig, AgentKey } from '../../../application/ports/agent-config.interface';
import { LlmModel } from '../../../application/ports/agent-types';
import { Tool } from '../../../application/ports/tool.interface';
import { SupportDeskPrompts } from '../../../application/constants/support-desk.prompts';
import { TECH_SUPPORT_TOOLS } from '../../../application/ports/tool.tokens';

@Injectable()
export class TechSupportAgentConfig implements AgentConfig {
  readonly key = AgentKey.TechSupport;
  readonly systemPrompt = SupportDeskPrompts.TECH_SUPPORT;
  readonly maxTurns = 10;
  readonly model = LlmModel.GeminiFlash;
  readonly temperature = 0.1;

  constructor(@Inject(TECH_SUPPORT_TOOLS) readonly tools: Tool[]) {}
}
