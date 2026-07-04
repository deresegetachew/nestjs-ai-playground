import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const CreateTicketInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
  subject: z.string().max(120).describe('Short summary of the issue'),
  description: z.string().describe('Detailed description of the issue'),
  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .default('medium')
    .describe('Ticket priority'),
});

type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;

interface TicketResult {
  ticket_id: string;
  status: string;
  priority: string;
  eta: string;
}

@Injectable()
export class CreateTicketTool implements Tool<CreateTicketInput, TicketResult> {
  readonly name = 'create_ticket';
  readonly description = 'Create a support ticket for an issue that cannot be immediately resolved. Always create a ticket before ending a conversation with an unresolved issue.';
  readonly version = '1';
  readonly schema = CreateTicketInputSchema;

  async execute(input: CreateTicketInput): Promise<TicketResult> {
    const id = Math.floor(1000 + Math.random() * 9000);
    const eta = input.priority === 'critical' ? '2 hours'
      : input.priority === 'high' ? '4 hours'
      : input.priority === 'medium' ? '1 business day'
      : '3 business days';

    return {
      ticket_id: `TKT-${id}`,
      status: 'open',
      priority: input.priority,
      eta,
    };
  }
}
