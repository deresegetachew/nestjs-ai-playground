import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Observable, of } from 'rxjs';
import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AskSimpleChatbotCommand } from '../commands/ask-simple-chatbot.command';
import {
  validateAndSanitizeInput,
  UserInputSchema,
} from '../guardrails/input.guardrail';

@CommandHandler(AskSimpleChatbotCommand)
export class AskSimpleChatbotHandler implements ICommandHandler<
  AskSimpleChatbotCommand,
  Observable<string>
> {
  constructor(private readonly agent: ReActAgentExecutor) {}

  async execute(command: AskSimpleChatbotCommand): Promise<Observable<string>> {
    // Pass user prompt through input guardrails (Zod validation & injection defense)
    const validatedMessage = validateAndSanitizeInput(
      command.message,
      UserInputSchema,
    );

    const result = await this.agent.run(
      'You are a helpful AI assistant.',
      [], // no tools for simple chatbot yet
      [{ role: 'user', content: validatedMessage }],
    );
    return of(result.reply);
  }
}
