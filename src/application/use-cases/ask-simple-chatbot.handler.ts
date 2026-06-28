import { Inject, Logger } from '@nestjs/common';
import { ICommandHandler } from '@nestjs/cqrs';

import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AskSimpleChatbotCommand, AskSimpleChatbotCommandSchema } from '../commands/ask-simple-chatbot.command';
import { Tool } from '../ports/tool.interface';
import { AGENT_TOOLS } from '../ports/tool.tokens';
import { SimpleChatbotSystemPrompt } from '../constants/agent-prompts';
import { AgentMessage, AgentStreamChunk } from '../ports/agent-types';
import { CommandHandlerWithValidation } from '../decorators/command-handler-with-validation.decorator';
import { TraceCommand } from '../decorators/trace-command.decorator';
import { Conversation } from '../../domain/models/conversation.entity';
import type { ConversationRepository } from '../../domain/ports/conversation-repository.port';
import { CONVERSATION_REPOSITORY } from '../../domain/ports/conversation-repository.port';
import { getTraceId } from '../utils/trace-context';

@TraceCommand('simple-chatbot')
@CommandHandlerWithValidation(AskSimpleChatbotCommand, AskSimpleChatbotCommandSchema)
export class AskSimpleChatbotHandler implements ICommandHandler<
  AskSimpleChatbotCommand,
  AsyncIterable<AgentStreamChunk>
> {
  private readonly logger = new Logger(AskSimpleChatbotHandler.name);

  constructor(
    private readonly agent: ReActAgentExecutor,
    @Inject(AGENT_TOOLS)
    private readonly tools: Tool[],
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ConversationRepository,
  ) {}

  async execute(
    command: AskSimpleChatbotCommand,
  ): Promise<AsyncIterable<AgentStreamChunk>> {
    this.logger.debug('chatbot_command_received', {
      conversationId: command.conversationId,
      messageLength: command.message.length,
    });

    // Load existing conversation or create new
    const conversation = await this.conversationRepo.findById(command.conversationId)
      || Conversation.create(command.conversationId, 'simple-chatbot');

    // Prepend user message
    const userMessage: AgentMessage = { role: 'user', content: command.message };
    conversation.addMessage(userMessage);

    const self = this;
    async function* streamResults(): AsyncGenerator<AgentStreamChunk, void, unknown> {
      try {
        const agentStream = self.agent.run(
          SimpleChatbotSystemPrompt.SYSTEM_PROMPT,
          self.tools,
          conversation.messages,
          10,
          getTraceId(),
          'simple-chatbot',
        );

        for await (const chunk of agentStream) {
          if (chunk.type === 'message_added') {
            conversation.addMessage(chunk.message);
            try {
              await self.conversationRepo.save(conversation);
            } catch (err: any) {
              self.logger.error(
                `Failed to save conversation incrementally: ${err.message || err}`,
                err.stack,
              );
            }
          }
          yield chunk;
        }

        // Final flush save
        await self.conversationRepo.save(conversation);
      } catch (err) {
        throw err;
      }
    }

    return streamResults();
  }
}
