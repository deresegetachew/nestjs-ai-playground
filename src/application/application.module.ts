import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AskSimpleChatbotHandler } from './use-cases/ask-simple-chatbot.handler';
import { ReActAgentExecutor } from './services/react-agent-executor.service';

const useCases = [AskSimpleChatbotHandler];

const agentExecutors = [ReActAgentExecutor];

@Module({
  imports: [CqrsModule],
  providers: [...useCases, ...agentExecutors],
})
export class ApplicationModule {}
