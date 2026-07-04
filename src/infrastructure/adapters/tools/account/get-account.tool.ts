import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const GetAccountInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
});

type GetAccountInput = z.infer<typeof GetAccountInputSchema>;

interface Account {
  id: string;
  email: string;
  plan: string;
  status: string;
  created_at: string;
  features: string[];
}

@Injectable()
export class GetAccountTool implements Tool<GetAccountInput, Account> {
  readonly name = 'get_account';
  readonly description = 'Retrieve account details for a customer. Always call this before making any account changes.';
  readonly version = '1';
  readonly schema = GetAccountInputSchema;

  async execute(input: GetAccountInput): Promise<Account> {
    return {
      id: input.customer_id,
      email: `user-${input.customer_id}@example.com`,
      plan: 'Pro',
      status: 'active',
      created_at: '2025-01-15',
      features: ['unlimited_seats', 'api_access', 'priority_support'],
    };
  }
}
