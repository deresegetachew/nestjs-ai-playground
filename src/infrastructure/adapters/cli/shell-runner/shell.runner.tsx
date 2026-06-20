import { Command, CommandRunner, InjectCommander } from 'nest-commander';
import { CommandBus } from '@nestjs/cqrs';
import { AgentRegistry, RegistryCommand } from './agent.registry';
import { ShellRouter } from './shell.router';
import { Observable } from 'rxjs';
import { AskSimpleChatbotCommand } from '../../../../application/commands/ask-simple-chatbot.command';

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
      />,
    );

    // Keep process alive until Ink exits
    await waitUntilExit();
  }

  /**
   * Route agent execution request to CommandBus, returning streaming observable.
   */
  private async handleAgentStream(
    agentName: string,
    message: string,
  ): Promise<Observable<string>> {
    const normalizedName = agentName.replace(/-/g, '_').toLowerCase();

    if (normalizedName === 'simple_chatbot') {
      return this.commandBus.execute<
        AskSimpleChatbotCommand,
        Observable<string>
      >(new AskSimpleChatbotCommand(message));
    }

    throw new Error(
      `Execution of agent "${agentName}" is not configured in the shell.`,
    );
  }
}
