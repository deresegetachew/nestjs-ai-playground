import { Inject, Injectable } from '@nestjs/common';
import { AgentConfig, AgentKey } from '../../../application/ports/agent-config.interface';
import { LlmModel } from '../../../application/ports/agent-types';
import { Tool } from '../../../application/ports/tool.interface';
import { SupportDeskPrompts } from '../../../application/constants/support-desk.prompts';
import { ACCOUNT_TOOLS } from '../../../application/ports/tool.tokens';

@Injectable()
export class AccountAgentConfig implements AgentConfig {
  readonly key = AgentKey.Account;
  readonly systemPrompt = SupportDeskPrompts.ACCOUNT;
  readonly maxTurns = 6;
  readonly model = LlmModel.GeminiFlash;
  readonly temperature = 0.1;

  constructor(@Inject(ACCOUNT_TOOLS) readonly tools: Tool[]) {}
}
