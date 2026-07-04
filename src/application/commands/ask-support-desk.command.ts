import { z } from 'zod';
import { UserInputSchema, validateAndSanitizeInput } from '../guardrails/input.guardrail';

export const AskSupportDeskCommandSchema = z.object({
  message: z.string()
    .min(1, { message: 'Message cannot be empty.' })
    .max(4000, { message: 'Message is too long.' })
    .refine(
      (msg) => {
        try {
          validateAndSanitizeInput(msg, UserInputSchema);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Potential prompt injection detected' },
    ),
  conversationId: z.string().min(1, { message: 'Conversation ID is required.' }),
  traceId: z.string().optional(),
});

export type AskSupportDeskCommandType = z.infer<typeof AskSupportDeskCommandSchema>;

export class AskSupportDeskCommand implements AskSupportDeskCommandType {
  public readonly message: string;
  public readonly conversationId: string;
  public readonly traceId?: string;

  constructor(message: string, conversationId: string, traceId?: string) {
    this.message = message;
    this.conversationId = conversationId;
    this.traceId = traceId;
  }
}
