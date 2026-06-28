import { z } from 'zod';
import { UserInputSchema, validateAndSanitizeInput } from '../guardrails/input.guardrail';

export const AgentContentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    name: z.string(),
    content: z.string(),
  }),
]);

export const AgentMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(AgentContentBlockSchema)]),
});

export const AskSimpleChatbotCommandSchema = z.object({
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
      { message: 'Potential prompt injection detected' }
    ),
  conversationId: z.string().min(1, { message: 'Conversation ID is required.' }),
  traceId: z.string().optional(),
  history: z.array(AgentMessageSchema).optional(),
});

export type AskSimpleChatbotCommandType = z.infer<typeof AskSimpleChatbotCommandSchema>;

export class AskSimpleChatbotCommand implements AskSimpleChatbotCommandType {
  public readonly message: string;
  public readonly conversationId: string;
  public readonly traceId?: string;
  public readonly history?: AskSimpleChatbotCommandType['history'];

  constructor(
    message: string,
    conversationId: string,
    traceId?: string,
    history?: AskSimpleChatbotCommandType['history'],
  ) {
    this.message = message;
    this.conversationId = conversationId;
    this.traceId = traceId;
    this.history = history;
  }
}
