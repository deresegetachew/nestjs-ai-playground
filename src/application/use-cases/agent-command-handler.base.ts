import { Logger } from '@nestjs/common';
import { AgentStreamChunk } from '../ports/agent-types';
import { Conversation } from '../../domain/models/conversation.entity';
import type { ConversationRepository } from '../../domain/ports/conversation-repository.port';

interface AgentCommand {
  conversationId: string;
  message: string;
}

export abstract class AgentCommandHandler<TCommand extends AgentCommand> {
  protected abstract readonly logger: Logger;
  protected abstract readonly agentName: string;

  constructor(protected readonly conversationRepo: ConversationRepository) {}

  async execute(command: TCommand): Promise<AsyncIterable<AgentStreamChunk>> {
    const conversation =
      (await this.conversationRepo.findById(command.conversationId)) ??
      Conversation.create(command.conversationId, this.agentName);

    conversation.addMessage({ role: 'user', content: command.message });

    return this.streamWithPersistence(conversation, this.createAgentStream(conversation, command));
  }

  protected abstract createAgentStream(
    conversation: Conversation,
    command: TCommand,
  ): AsyncIterable<AgentStreamChunk>;

  private async *streamWithPersistence(
    conversation: Conversation,
    agentStream: AsyncIterable<AgentStreamChunk>,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    try {
      for await (const chunk of agentStream) {
        if (chunk.type === 'message_added') {
          conversation.addMessage(chunk.message);
          try {
            await this.conversationRepo.save(conversation);
          } catch (err: any) {
            this.logger.error(
              `Failed to save conversation incrementally: ${err.message || err}`,
              err.stack,
            );
          }
        }
        yield chunk;
      }
    } finally {
      await this.conversationRepo.save(conversation);
    }
  }
}
