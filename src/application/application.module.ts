import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AskSimpleChatbotHandler } from './use-cases/ask-simple-chatbot.handler';
import { AskSupportDeskHandler } from './use-cases/ask-support-desk.handler';
import { ReActAgentExecutor } from './services/react-agent-executor.service';
import { TriageAgentExecutor } from './services/triage-agent-executor.service';
import { ToolExecutor } from './services/tool-executor.service';
import { AgentConfigFactory } from './services/agent-config-factory.service';

const useCases = [AskSimpleChatbotHandler, AskSupportDeskHandler];

const agentExecutors = [ReActAgentExecutor, TriageAgentExecutor, ToolExecutor];
const factories = [AgentConfigFactory];

@Module({
  imports: [CqrsModule],
  providers: [
    ...useCases,
    ...agentExecutors,
    ...factories,
  ],
})
export class ApplicationModule {}
