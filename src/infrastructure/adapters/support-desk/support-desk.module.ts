import { Module } from '@nestjs/common';
import { SUPPORT_DESK_AGENT_CONFIGS } from '../../../application/ports/agent-config.interface';
import { BillingAgentConfig } from './billing-agent.config';
import { TechSupportAgentConfig } from './tech-support-agent.config';
import { AccountAgentConfig } from './account-agent.config';

@Module({
  providers: [
    BillingAgentConfig,
    TechSupportAgentConfig,
    AccountAgentConfig,
    {
      provide: SUPPORT_DESK_AGENT_CONFIGS,
      useFactory: (
        billing: BillingAgentConfig,
        techSupport: TechSupportAgentConfig,
        account: AccountAgentConfig,
      ) => [billing, techSupport, account],
      inject: [BillingAgentConfig, TechSupportAgentConfig, AccountAgentConfig],
    },
  ],
  exports: [SUPPORT_DESK_AGENT_CONFIGS],
})
export class SupportDeskModule {}
