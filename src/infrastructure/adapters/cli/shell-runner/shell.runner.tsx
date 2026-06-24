import { Command, CommandRunner, InjectCommander } from 'nest-commander';
import { CommandBus } from '@nestjs/cqrs';
import { AgentRegistry, RegistryCommand } from './agent.registry';
import { ShellRouter } from './shell.router';
import { Observable, tap } from 'rxjs';
import { AskSimpleChatbotCommand } from '../../../../application/commands/ask-simple-chatbot.command';
import { AgentMessage, AgentStreamChunk } from '../../../../application/ports/agent-types';

interface CommanderInstance {
  commands: RegistryCommand[];
}

@Command({
  name: 'shell',
  description: 'Start a persistent interactive shell',
})
export class ShellRunner extends CommandRunner {
  private readonly shellRouter: ShellRouter;

  /**
   * Per-agent conversation history.
   * Key: normalised agent name (snake_case).
   * Value: accumulated AgentMessage turns for the active interrupt session.
   *
   * History is kept only while the agent is mid-task (asked a clarifying
   * question). Once it emits a "Final Answer:", the history is cleared so
   * the next user message starts a fresh, unrelated conversation.
   * It is also cleared explicitly when the user exits the agent session.
   */
  private readonly agentHistories = new Map<string, AgentMessage[]>();

  constructor(
    @InjectCommander() private readonly commander: CommanderInstance,
    private readonly commandBus: CommandBus,
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
        onGetAgentStream={async (agentName, message) =>
          this.handleAgentStream(agentName, message)
        }
        onExitAgentSession={(agentName) => {
          const key = agentName.replace(/-/g, '_').toLowerCase();
          this.agentHistories.delete(key);
        }}
      />,
    );

    // Keep process alive until Ink exits
    await waitUntilExit();
  }

  /**
   * Route agent execution request to CommandBus, returning a streaming
   * observable that also maintains interrupt-aware conversation history.
   *
   * History lifecycle:
   *  - If the agent ends with "Final Answer:" → history is cleared (task done).
   *  - If the agent asks a question (no "Final Answer:") → history is kept
   *    so the next user reply has full context (interrupt pattern).
   */
  private async handleAgentStream(
    agentName: string,
    message: string,
  ): Promise<Observable<AgentStreamChunk>> {
    const normalizedName = agentName.replace(/-/g, '_').toLowerCase();

    if (normalizedName === 'simple_chatbot') {
      const history = this.agentHistories.get(normalizedName) ?? [];

      const stream$ = await this.commandBus.execute<
        AskSimpleChatbotCommand,
        Observable<AgentStreamChunk>
      >(new AskSimpleChatbotCommand(message, history));

      // Tap the stream to track text and detect whether this turn ends with
      // a proper "Final Answer:" or with a clarifying question (interrupt).
      let streamedText = '';
      let hasFinalAnswer = false;

      return stream$.pipe(
        tap({
          next: (chunk) => {
            if (chunk.type === 'text') {
              streamedText += chunk.text;
            }
            if (chunk.type === 'turn_completed' && chunk.isEnd) {
              hasFinalAnswer = /final answer\s*:\s*/i.test(streamedText);
            }
          },
          complete: () => {
            if (hasFinalAnswer) {
              // Task complete — next message is a new, unrelated question.
              this.agentHistories.delete(normalizedName);
            } else {
              // Agent asked a clarifying question — extend the history so
              // the next user reply arrives with full context.
              const prev = this.agentHistories.get(normalizedName) ?? [];
              this.agentHistories.set(normalizedName, [
                ...prev,
                { role: 'user', content: message },
                { role: 'assistant', content: streamedText },
              ]);
            }
          },
          error: () => {
            // On error, clear history so the session starts clean on retry.
            this.agentHistories.delete(normalizedName);
          },
        }),
      );
    }

    throw new Error(
      `Execution of agent "${agentName}" is not configured in the shell.`,
    );
  }
}

