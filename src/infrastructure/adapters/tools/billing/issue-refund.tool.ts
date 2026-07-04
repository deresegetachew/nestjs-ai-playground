import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const IssueRefundInputSchema = z.object({
  invoice_id: z.string().describe('Invoice ID to refund'),
  reason: z.string().min(5).describe('Reason for the refund'),
  confirmed: z.boolean().refine(v => v === true, { message: 'confirmed must be true' }).describe(
    'Must be true. Only set this after you have told the customer the exact invoice ID and amount, ' +
    'and they have explicitly said yes to the refund.',
  ),
});

type IssueRefundInput = z.infer<typeof IssueRefundInputSchema>;

interface RefundResult {
  confirmation: string;
  status: string;
  eta: string;
}

@Injectable()
export class IssueRefundTool implements Tool<IssueRefundInput, RefundResult> {
  readonly name = 'issue_refund';
  readonly description = 'Issue a refund for a specific invoice. Always call get_invoice first to confirm the charge. Returns a confirmation ID.';
  readonly version = '1';
  readonly schema = IssueRefundInputSchema;

  async execute(input: IssueRefundInput): Promise<RefundResult> {
    const suffix = input.invoice_id.replace('INV-', '');
    return {
      confirmation: `REF-${suffix}`,
      status: 'approved',
      eta: '3-5 business days',
    };
  }
}
