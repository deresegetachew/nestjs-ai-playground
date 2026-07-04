import { Inject, Logger } from '@nestjs/common';

import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AskSimpleChatbotCommand, AskSimpleChatbotCommandSchema } from '../commands/ask-simple-chatbot.command';
import { Tool } from '../ports/tool.interface';
import { SIMPLE_CHATBOT_TOOLS } from '../ports/tool.tokens';
import { SimpleChatbotSystemPrompt } from '../constants/agent-prompts';
import { AgentStreamChunk } from '../ports/agent-types';
import { CommandHandlerWithValidation } from '../decorators/command-handler-with-validation.decorator';
import { TraceCommand } from '../decorators/trace-command.decorator';
import { Conversation } from '../../domain/models/conversation.entity';
import type { ConversationRepository } from '../../domain/ports/conversation-repository.port';
import { CONVERSATION_REPOSITORY } from '../../domain/ports/conversation-repository.port';
import { getTraceId } from '../utils/trace-context';
import { AgentCommandHandler } from './agent-command-handler.base';

@TraceCommand('simple-chatbot')
@CommandHandlerWithValidation(AskSimpleChatbotCommand, AskSimpleChatbotCommandSchema)
export class AskSimpleChatbotHandler extends AgentCommandHandler<AskSimpleChatbotCommand> {
  protected readonly logger = new Logger(AskSimpleChatbotHandler.name);
  protected readonly agentName = 'simple-chatbot';

  constructor(
    private readonly agent: ReActAgentExecutor,
    @Inject(SIMPLE_CHATBOT_TOOLS) private readonly tools: Tool[],
    @Inject(CONVERSATION_REPOSITORY) conversationRepo: ConversationRepository,
  ) {
    super(conversationRepo);
  }

  protected createAgentStream(conversation: Conversation): AsyncIterable<AgentStreamChunk> {
    return this.agent.run(
      SimpleChatbotSystemPrompt.SYSTEM_PROMPT,
      this.tools,
      conversation.messages,
      10,
      getTraceId(),
      'simple-chatbot',
    );
  }
}
