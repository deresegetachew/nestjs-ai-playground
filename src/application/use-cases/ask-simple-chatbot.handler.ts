import { Inject, Logger } from '@nestjs/common';
import { ICommandHandler } from '@nestjs/cqrs';
import { Observable } from 'rxjs';
import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AskSimpleChatbotCommand } from '../commands/ask-simple-chatbot.command';
import { Tool } from '../ports/tool.interface';
import { AGENT_TOOLS } from '../ports/tool.tokens';
import { SYSTEM_PROMPT } from '../constants/agent-prompts';
import { AgentMessage, AgentStreamChunk } from '../ports/agent-types';
import { CommandHandlerWithValidation } from '../decorators/command-handler-with-validation.decorator';
import { AskSimpleChatbotCommandSchema } from '../guardrails/input.guardrail';

@CommandHandlerWithValidation(AskSimpleChatbotCommand, AskSimpleChatbotCommandSchema)
export class AskSimpleChatbotHandler implements ICommandHandler<
  AskSimpleChatbotCommand,
  Observable<AgentStreamChunk>
> {
  private readonly logger = new Logger(AskSimpleChatbotHandler.name);

  constructor(
    private readonly agent: ReActAgentExecutor,
    @Inject(AGENT_TOOLS)
    private readonly tools: Tool[],
  ) {}

  execute(
    command: AskSimpleChatbotCommand,
  ): Promise<Observable<AgentStreamChunk>> {
    this.logger.debug(
      `Received chatbot command. Message length: ${command.message.length}, History length: ${command.history.length}`,
    );

    // Prepend prior conversation history so the agent has full context.
    const messages: AgentMessage[] = [
      ...command.history,
      { role: 'user', content: command.message },
    ];

    return Promise.resolve(
      this.agent.run(SYSTEM_PROMPT, this.tools, messages),
    );
  }
}
