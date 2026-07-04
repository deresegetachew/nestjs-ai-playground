import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const CancelSubscriptionInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
  reason: z.string().describe('Why the customer is cancelling'),
  effective: z
    .enum(['immediately', 'end_of_period'])
    .default('end_of_period')
    .describe('When the cancellation takes effect'),
  confirmed: z.boolean().refine(v => v === true, { message: 'confirmed must be true' }).describe(
    'Must be true. Only set this after you have shown the customer their current plan details ' +
    'and they have explicitly confirmed they want to cancel.',
  ),
});

type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionInputSchema>;

interface CancellationResult {
  confirmation: string;
  effective_date: string;
  message: string;
}

@Injectable()
export class CancelSubscriptionTool implements Tool<CancelSubscriptionInput, CancellationResult> {
  readonly name = 'cancel_subscription';
  readonly description = 'Cancel a customer subscription. Always retrieve the account and confirm the customer\'s intent before calling this. This action cannot be easily reversed.';
  readonly version = '1';
  readonly schema = CancelSubscriptionInputSchema;

  async execute(input: CancelSubscriptionInput): Promise<CancellationResult> {
    const id = Math.floor(1000 + Math.random() * 9000);
    const effectiveDate = input.effective === 'immediately'
      ? new Date().toISOString().split('T')[0]
      : '2026-07-31';

    return {
      confirmation: `CXL-${id}`,
      effective_date: effectiveDate,
      message: input.effective === 'immediately'
        ? 'Subscription cancelled immediately. Access has been revoked.'
        : 'Subscription will cancel at the end of the current billing period. You retain access until then.',
    };
  }
}
