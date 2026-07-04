import { Command, CommandRunner, InjectCommander } from 'nest-commander';
import { CommandBus } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AgentRegistry, RegistryCommand } from './agent.registry';
import { ShellRouter } from './shell.router';
import { AskSimpleChatbotCommand } from '../../../../application/commands/ask-simple-chatbot.command';
import { AskSupportDeskCommand } from '../../../../application/commands/ask-support-desk.command';
import { AgentMessage, AgentStreamChunk } from '../../../../application/ports/agent-types';
import type { ConversationRepository } from '../../../../domain/ports/conversation-repository.port';
import { CONVERSATION_REPOSITORY } from '../../../../domain/ports/conversation-repository.port';

interface CommanderInstance {
  commands: RegistryCommand[];
}

@Command({
  name: 'shell',
  description: 'Start a persistent interactive shell',
})
export class ShellRunner extends CommandRunner {
  private readonly shellRouter: ShellRouter;

  constructor(
    @InjectCommander() private readonly commander: CommanderInstance,
    private readonly commandBus: CommandBus,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ConversationRepository,
  ) {
    super();
    this.shellRouter = new ShellRouter();
  }

  async run(): Promise<void> {
    process.env.CLI_SHELL = 'true';

    const agentRegistry = new AgentRegistry(this.commander.commands);

    // Dynamically import ES modules with top-level await
    const ink = await import('ink');
    const React = (await import('react')).default;
    const TextInput = (await import('ink-text-input')).default;
    const SelectInput = (await import('ink-select-input')).default;
    const Spinner = (await import('ink-spinner')).default;
    const { ShellUI } = await import('./ui/ShellUI.js');

    // Start Ink terminal UI render loop
    const { waitUntilExit } = ink.render(
      <ShellUI
        ink={ink}
        TextInput={TextInput}
        SelectInput={SelectInput}
        Spinner={Spinner}
        agentRegistry={agentRegistry}
        shellRouter={this.shellRouter}
        onGetAgentStream={async (agentName, message, conversationId) =>
          this.handleAgentStream(agentName, message, conversationId)
        }
        onListConversations={async (agentName) => {
          const normalized = agentName.replace(/_/g, '-').toLowerCase();
          const list = await this.conversationRepo.findAllByAgent(normalized);
          return list.map((c) => ({
            id: c.id,
            updatedAt: c.updatedAt.toISOString(),
          }));
        }}
        onLoadConversation={async (conversationId) => {
          const c = await this.conversationRepo.findById(conversationId);
          return c ? c.messages : [];
        }}
      />,
    );

    // Keep process alive until Ink exits
    await waitUntilExit();
  }

  /**
   * Route agent execution request to CommandBus, returning a streaming
   * async iterable.
   */
  private async handleAgentStream(
    agentName: string,
    message: string,
    conversationId: string,
  ): Promise<AsyncIterable<AgentStreamChunk>> {
    const normalizedName = agentName.replace(/-/g, '_').toLowerCase();

    if (normalizedName === 'simple_chatbot') {
      const traceId = crypto.randomUUID().replace(/-/g, '');
      return this.commandBus.execute<
        AskSimpleChatbotCommand,
        AsyncIterable<AgentStreamChunk>
      >(new AskSimpleChatbotCommand(message, conversationId, traceId));
    }

    if (normalizedName === 'support_desk') {
      const traceId = crypto.randomUUID().replace(/-/g, '');
      return this.commandBus.execute<
        AskSupportDeskCommand,
        AsyncIterable<AgentStreamChunk>
      >(new AskSupportDeskCommand(message, conversationId, traceId));
    }

    throw new Error(
      `Execution of agent "${agentName}" is not configured in the shell.`,
    );
  }
}

