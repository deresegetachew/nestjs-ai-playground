import { Module } from '@nestjs/common';
import { CqrsModule, CommandBus } from '@nestjs/cqrs';
import { AskSimpleChatbotHandler } from './use-cases/ask-simple-chatbot.handler';
import { ReActAgentExecutor } from './services/react-agent-executor.service';
import { ToolExecutor } from './services/tool-executor.service';

const useCases = [AskSimpleChatbotHandler];

const agentExecutors = [ReActAgentExecutor, ToolExecutor];

@Module({
  imports: [CqrsModule],
  providers: [
    ...useCases,
    ...agentExecutors,
  ],
})
export class ApplicationModule {}


