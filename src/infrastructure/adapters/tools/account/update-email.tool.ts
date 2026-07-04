import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const UpdateEmailInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
  new_email: z.string().email().describe('New email address'),
});

type UpdateEmailInput = z.infer<typeof UpdateEmailInputSchema>;

interface UpdateEmailResult {
  success: boolean;
  updated_email: string;
}

@Injectable()
export class UpdateEmailTool implements Tool<UpdateEmailInput, UpdateEmailResult> {
  readonly name = 'update_email';
  readonly description = 'Update the email address on a customer account. Always call get_account first to confirm the account exists.';
  readonly version = '1';
  readonly schema = UpdateEmailInputSchema;

  async execute(input: UpdateEmailInput): Promise<UpdateEmailResult> {
    return {
      success: true,
      updated_email: input.new_email,
    };
  }
}
