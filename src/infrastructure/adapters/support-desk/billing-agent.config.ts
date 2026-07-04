import { Inject, Injectable } from '@nestjs/common';
import { AgentConfig, AgentKey } from '../../../application/ports/agent-config.interface';
import { LlmModel } from '../../../application/ports/agent-types';
import { Tool } from '../../../application/ports/tool.interface';
import { SupportDeskPrompts } from '../../../application/constants/support-desk.prompts';
import { BILLING_TOOLS } from '../../../application/ports/tool.tokens';

@Injectable()
export class BillingAgentConfig implements AgentConfig {
  readonly key = AgentKey.Billing;
  readonly systemPrompt = SupportDeskPrompts.BILLING;
  readonly maxTurns = 8;
  readonly model = LlmModel.GeminiFlash;
  readonly temperature = 0.1;

  constructor(@Inject(BILLING_TOOLS) readonly tools: Tool[]) {}
}
