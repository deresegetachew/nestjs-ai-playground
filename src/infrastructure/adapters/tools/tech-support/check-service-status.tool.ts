import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const CheckServiceStatusInputSchema = z.object({
  service: z
    .enum(['dashboard', 'api', 'webhooks', 'billing-portal', 'auth'])
    .describe('The service to check'),
});

type CheckServiceStatusInput = z.infer<typeof CheckServiceStatusInputSchema>;

interface ServiceStatus {
  service: string;
  status: 'operational' | 'degraded' | 'outage';
  message: string;
  since?: string;
}

@Injectable()
export class CheckServiceStatusTool implements Tool<CheckServiceStatusInput, ServiceStatus> {
  readonly name = 'check_service_status';
  readonly description = 'Check the current status of a SupportDesk service. Always check this before assuming a bug is user-specific.';
  readonly version = '1';
  readonly schema = CheckServiceStatusInputSchema;

  async execute(input: CheckServiceStatusInput): Promise<ServiceStatus> {
    if (input.service === 'dashboard') {
      return {
        service: 'dashboard',
        status: 'degraded',
        message: 'Increased load times on dashboard charts. Engineers are investigating.',
        since: '2026-06-30T08:15:00Z',
      };
    }
    return {
      service: input.service,
      status: 'operational',
      message: 'No issues detected.',
    };
  }
}
