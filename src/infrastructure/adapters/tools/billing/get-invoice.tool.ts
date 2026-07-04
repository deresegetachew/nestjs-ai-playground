import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const GetInvoiceInputSchema = z.object({
  invoice_id: z.string().describe('Invoice ID, e.g. INV-1234'),
});

type GetInvoiceInput = z.infer<typeof GetInvoiceInputSchema>;

interface Invoice {
  id: string;
  amount: number;
  status: string;
  date: string;
  items: { description: string; amount: number }[];
}

@Injectable()
export class GetInvoiceTool implements Tool<GetInvoiceInput, Invoice> {
  readonly name = 'get_invoice';
  readonly description = 'Retrieve an invoice by ID. Returns amount, status, date, and line items. Always call this before issuing a refund.';
  readonly version = '1';
  readonly schema = GetInvoiceInputSchema;

  async execute(input: GetInvoiceInput): Promise<Invoice> {
    if (input.invoice_id === 'INV-0091') {
      return {
        id: 'INV-0091',
        amount: 149.00,
        status: 'paid',
        date: '2026-06-01',
        items: [{ description: 'Pro Plan — June 2026', amount: 149.00 }],
      };
    }
    return {
      id: input.invoice_id,
      amount: 99.00,
      status: 'pending',
      date: '2026-06-15',
      items: [{ description: 'Starter Plan — June 2026', amount: 99.00 }],
    };
  }
}
