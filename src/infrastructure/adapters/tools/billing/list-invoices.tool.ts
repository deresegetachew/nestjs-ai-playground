import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const ListInvoicesInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
  limit: z.number().int().min(1).max(20).optional().default(5).describe('Max invoices to return'),
});

type ListInvoicesInput = z.infer<typeof ListInvoicesInputSchema>;

interface InvoiceSummary {
  id: string;
  amount: number;
  date: string;
  status: string;
}

@Injectable()
export class ListInvoicesTool implements Tool<ListInvoicesInput, InvoiceSummary[]> {
  readonly name = 'list_invoices';
  readonly description = 'List recent invoices for a customer. Use when the customer does not know their invoice ID.';
  readonly version = '1';
  readonly schema = ListInvoicesInputSchema;

  async execute(_input: ListInvoicesInput): Promise<InvoiceSummary[]> {
    return [
      { id: 'INV-0091', amount: 149.00, date: '2026-06-01', status: 'paid' },
      { id: 'INV-0078', amount: 149.00, date: '2026-05-01', status: 'paid' },
      { id: 'INV-0065', amount: 99.00,  date: '2026-04-01', status: 'paid' },
    ];
  }
}
