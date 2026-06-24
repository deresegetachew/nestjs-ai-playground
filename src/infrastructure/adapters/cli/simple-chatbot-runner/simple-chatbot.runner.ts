import { Command, CommandRunner } from 'nest-commander';
import { CommandBus } from '@nestjs/cqrs';
import { Observable } from 'rxjs';
import { AskSimpleChatbotCommand } from '../../../../application/commands/ask-simple-chatbot.command';
import { AgentStreamChunk } from '../../../../application/ports/agent-types';

import pc from 'picocolors';
import ora from 'ora';
import {
  RateLimitException,
  AuthenticationException,
  APIOverloadedException,
  ServerException,
  InvalidRequestException,
} from '../../../../application/exceptions/ai-client.exception';

function getFriendlyErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    if (err instanceof RateLimitException) {
      const msg = err.message;
      const delayMatch = msg.match(/retry in ([\d.]+)s/i);
      const seconds = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) : 7;
      return `Rate limit exceeded. Please try again in ${seconds} seconds.`;
    }
    if (err instanceof AuthenticationException) {
      return 'Authentication failed. Please check your API keys.';
    }
    if (err instanceof APIOverloadedException) {
      return 'AI service is currently overloaded. Please try again shortly.';
    }
    if (err instanceof ServerException) {
      return 'The AI service returned a server error. Please try again later.';
    }
    if (err instanceof InvalidRequestException) {
      return `Invalid request: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

@Command({
  name: 'simple_chatbot',
  arguments: '<message>',
  description: 'A simple chatbot command',
})
export class SimpleChatbotRunner extends CommandRunner {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const message = passedParams.join(' ');
    const isShell = process.env.CLI_SHELL === 'true';

    if (!isShell) {
      console.log(
        `\n💬 ${pc.magenta(pc.bold('user'))} ${pc.dim('›')} ${message}\n`,
      );
    }

    const agentPromptPrefix = `🤖 ${pc.green(pc.bold('simple-chatbot'))} ${pc.dim('›')} `;

    // Start ora spinner for dynamic visual feedback
    const spinner = ora({
      text: `🤖 ${pc.green(pc.bold('simple-chatbot'))} ${pc.dim('›')} thinking ...`,
      spinner: 'dots',
      color: 'magenta',
    }).start();

    try {
      const responseStream$ = await this.commandBus.execute<
        AskSimpleChatbotCommand,
        Observable<AgentStreamChunk>
      >(new AskSimpleChatbotCommand(message));

      let currentTurnText = '';

      await new Promise<void>((resolve, reject) => {
        responseStream$.subscribe({
          next: (chunk) => {
            switch (chunk.type) {
              case 'text':
                currentTurnText += chunk.text;
                break;
              case 'turn_completed':
                spinner.stop();
                if (chunk.isEnd) {
                  if (currentTurnText.trim()) {
                    process.stdout.write(
                      `${agentPromptPrefix}${pc.green(pc.bold('[Final Answer]:'))} ${currentTurnText}\n`,
                    );
                  }
                } else {
                  if (currentTurnText.trim()) {
                    process.stdout.write(
                      `${agentPromptPrefix}${pc.cyan(pc.bold('[Thought]:'))} ${currentTurnText}\n`,
                    );
                  }
                  currentTurnText = '';
                  spinner.start(
                    `🤖 ${pc.green(pc.bold('simple-chatbot'))} ${pc.dim('›')} thinking ...`,
                  );
                }
                break;
              case 'tool_use':
                spinner.stop();
                process.stdout.write(
                  `${agentPromptPrefix}${pc.yellow(pc.bold('[Calling Tool]:'))} ${chunk.name} with ${JSON.stringify(chunk.input)}\n`,
                );
                break;
              case 'observation':
                spinner.stop();
                process.stdout.write(
                  `${agentPromptPrefix}${pc.gray(pc.bold('[Observation]:'))} ${chunk.content}\n`,
                );
                break;
              case 'warning':
                spinner.stop();
                process.stdout.write(
                  `${agentPromptPrefix}${pc.red(pc.bold('[Warning]:'))} ${chunk.text}\n`,
                );
                break;
              case 'error':
                spinner.stop();
                process.stdout.write(
                  `${agentPromptPrefix}${pc.red(pc.bold('[Error]:'))} ${chunk.text}\n`,
                );
                break;
            }
          },
          error: (err: unknown) => {
            spinner.stop();
            reject(err instanceof Error ? err : new Error(String(err)));
          },
          complete: () => {
            spinner.stop();
            resolve();
          },
        });
      });
    } catch (err: unknown) {
      spinner.stop();
      const friendlyMsg = getFriendlyErrorMessage(err);
      process.stdout.write(
        `${agentPromptPrefix}❌ ${pc.red(pc.bold('Error:'))} ${friendlyMsg}\n`,
      );
    }
  }
}
