import { Command, CommandRunner } from 'nest-commander';
import { CommandBus } from '@nestjs/cqrs';
import * as crypto from 'node:crypto';

import { AskSupportDeskCommand } from '../../../../application/commands/ask-support-desk.command';
import { AgentStreamChunk } from '../../../../application/ports/agent-types';

import pc from 'picocolors';
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
    if (err instanceof AuthenticationException) return 'Authentication failed. Please check your API keys.';
    if (err instanceof APIOverloadedException) return 'AI service is currently overloaded. Please try again shortly.';
    if (err instanceof ServerException) return 'The AI service returned a server error. Please try again later.';
    if (err instanceof InvalidRequestException) return `Invalid request: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

@Command({
  name: 'support_desk',
  arguments: '<message>',
  description: 'SupportDesk — multi-agent support (billing · tech · account)',
})
export class SupportDeskRunner extends CommandRunner {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const ora = (await import('ora')).default;
    const message = passedParams.join(' ');
    const isShell = process.env.CLI_SHELL === 'true';

    if (!isShell) {
      console.log(`\n💬 ${pc.magenta(pc.bold('user'))} ${pc.dim('›')} ${message}\n`);
    }

    const agentPrefix = `🎫 ${pc.cyan(pc.bold('support-desk'))} ${pc.dim('›')} `;

    const spinner = ora({
      text: `${agentPrefix}routing ...`,
      spinner: 'dots',
      color: 'cyan',
    }).start();

    try {
      const conversationId = `oneshot-${crypto.randomUUID().substring(0, 8)}`;
      const traceId = crypto.randomUUID().replace(/-/g, '');

      const responseStream = await this.commandBus.execute<
        AskSupportDeskCommand,
        AsyncIterable<AgentStreamChunk>
      >(new AskSupportDeskCommand(message, conversationId, traceId));

      let hasPrintedThoughtPrefix = false;
      let hasPrintedTextPrefix = false;
      let activeSpecialist = '';

      for await (const chunk of responseStream) {
        switch (chunk.type) {
          case 'thought':
            if (spinner.isSpinning) spinner.stop();
            if (!hasPrintedThoughtPrefix) {
              process.stdout.write(`${agentPrefix}${pc.cyan(pc.bold('[Thought]:'))} `);
              hasPrintedThoughtPrefix = true;
            }
            process.stdout.write(chunk.text);
            break;

          case 'text':
            if (spinner.isSpinning) spinner.stop();
            if (!hasPrintedTextPrefix) {
              if (hasPrintedThoughtPrefix) process.stdout.write('\n');
              process.stdout.write(`${agentPrefix}${pc.green(pc.bold('[Answer]:'))} `);
              hasPrintedTextPrefix = true;
            }
            process.stdout.write(chunk.text);
            break;

          case 'turn_completed':
            if (spinner.isSpinning) spinner.stop();
            if (hasPrintedThoughtPrefix || hasPrintedTextPrefix) process.stdout.write('\n');
            hasPrintedThoughtPrefix = false;
            hasPrintedTextPrefix = false;
            if (!chunk.isEnd) {
              spinner.start(`${agentPrefix}${pc.dim('thinking ...')}`);
            }
            break;

          case 'routing_decision': {
            if (spinner.isSpinning) spinner.stop();
            const names = chunk.specialists.map((s) => s.replace('_', '-')).join(', ');
            process.stdout.write(
              `${agentPrefix}${pc.yellow(pc.bold(`[→ ${names}]`))} ${pc.dim(chunk.reason)}\n`,
            );
            break;
          }

          case 'specialist_start':
            if (spinner.isSpinning) spinner.stop();
            activeSpecialist = chunk.specialist.replace('_', '-');
            process.stdout.write(`\n${agentPrefix}${pc.cyan(pc.bold(`[${activeSpecialist}]`))}\n`);
            spinner.start(`${agentPrefix}${pc.cyan(pc.bold(activeSpecialist))} ${pc.dim('›')} thinking ...`);
            break;

          case 'tool_use':
            if (spinner.isSpinning) spinner.stop();
            process.stdout.write(
              `${agentPrefix}${pc.yellow(pc.bold('[Tool]:'))} ${chunk.name} ${pc.dim(JSON.stringify(chunk.input))}\n`,
            );
            break;

          case 'observation':
            if (spinner.isSpinning) spinner.stop();
            process.stdout.write(
              `${agentPrefix}${pc.gray(pc.bold('[Result]:'))} ${chunk.content}\n`,
            );
            break;

          case 'warning':
            if (spinner.isSpinning) spinner.stop();
            process.stdout.write(`${agentPrefix}${pc.red(pc.bold('[Warning]:'))} ${chunk.text}\n`);
            break;

          case 'error':
            if (spinner.isSpinning) spinner.stop();
            process.stdout.write(`${agentPrefix}${pc.red(pc.bold('[Error]:'))} ${chunk.text}\n`);
            break;
        }
      }
      spinner.stop();
    } catch (err: unknown) {
      spinner.stop();
      const friendlyMsg = getFriendlyErrorMessage(err);
      process.stdout.write(`${`🎫 ${pc.cyan(pc.bold('support-desk'))} ${pc.dim('›')}`} ❌ ${pc.red(pc.bold('Error:'))} ${friendlyMsg}\n`);
    }
  }
}
