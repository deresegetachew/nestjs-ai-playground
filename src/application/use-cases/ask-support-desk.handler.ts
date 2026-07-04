import { Inject, Logger } from '@nestjs/common';

import { TriageAgentExecutor } from '../services/triage-agent-executor.service';
import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AgentConfigFactory } from '../services/agent-config-factory.service';
import { AskSupportDeskCommand, AskSupportDeskCommandSchema } from '../commands/ask-support-desk.command';
import { AgentStreamChunk, LlmModel } from '../ports/agent-types';
import { AgentKey } from '../ports/agent-config.interface';
import { Tool } from '../ports/tool.interface';
import { SUPPORT_DESK_TRIAGE_TOOLS } from '../ports/tool.tokens';
import { SupportDeskPrompts } from '../constants/support-desk.prompts';
import { CommandHandlerWithValidation } from '../decorators/command-handler-with-validation.decorator';
import { TraceCommand } from '../decorators/trace-command.decorator';
import { Conversation } from '../../domain/models/conversation.entity';
import type { ConversationRepository } from '../../domain/ports/conversation-repository.port';
import { CONVERSATION_REPOSITORY } from '../../domain/ports/conversation-repository.port';
import { getTraceId } from '../utils/trace-context';
import { AgentCommandHandler } from './agent-command-handler.base';

@TraceCommand('support-desk')
@CommandHandlerWithValidation(AskSupportDeskCommand, AskSupportDeskCommandSchema)
export class AskSupportDeskHandler extends AgentCommandHandler<AskSupportDeskCommand> {
  protected readonly logger = new Logger(AskSupportDeskHandler.name);
  protected readonly agentName = 'support-desk';

  constructor(
    private readonly triageAgentExecutor: TriageAgentExecutor,
    private readonly reactAgentExecutor: ReActAgentExecutor,
    private readonly agentConfigFactory: AgentConfigFactory,
    @Inject(SUPPORT_DESK_TRIAGE_TOOLS) private readonly triageTools: Tool[],
    @Inject(CONVERSATION_REPOSITORY) conversationRepo: ConversationRepository,
  ) {
    super(conversationRepo);
  }

  protected async *createAgentStream(
    conversation: Conversation,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    const traceId = getTraceId();
    let specialists: AgentKey[] = [];

    for await (const chunk of this.triageAgentExecutor.run(
      SupportDeskPrompts.SUPERVISOR,
      this.triageTools,
      [conversation.messages[conversation.messages.length - 1]],
      undefined,
      traceId,
      undefined,
      LlmModel.GeminiFlashLite,
      0.0,
    )) {
      if (chunk.type === 'routing_decision') {
        specialists = chunk.specialists;
      }
      yield chunk;
    }

    if (specialists.length === 0) {
      this.logger.error({ event: 'triage_no_routing_decision', traceId });
      yield { type: 'error', text: 'Triage failed to select a specialist. Please try again.' };
      return;
    }

    for (const key of specialists) {
      const config = this.agentConfigFactory.get(key);
      yield { type: 'specialist_start', specialist: config.key };
      yield* this.reactAgentExecutor.run(
        config.systemPrompt,
        config.tools,
        conversation.messages,
        config.maxTurns,
        traceId,
        `specialist-${config.key.replace('_', '-')}`,
        config.model,
        config.temperature,
      );
    }
  }

}
