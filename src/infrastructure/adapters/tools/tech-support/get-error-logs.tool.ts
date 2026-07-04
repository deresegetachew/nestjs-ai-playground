import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';

const GetErrorLogsInputSchema = z.object({
  customer_id: z.string().describe('Customer ID'),
  from: z.string().optional().describe('ISO date string — defaults to last 24 hours'),
  error_code: z.string().optional().describe('Filter by specific error code'),
});

type GetErrorLogsInput = z.infer<typeof GetErrorLogsInputSchema>;

interface LogEntry {
  timestamp: string;
  error_code: string;
  message: string;
  service: string;
}

@Injectable()
export class GetErrorLogsTool implements Tool<GetErrorLogsInput, LogEntry[]> {
  readonly name = 'get_error_logs';
  readonly description = 'Retrieve recent error logs for a customer. Use to diagnose bugs and unexpected errors.';
  readonly version = '1';
  readonly schema = GetErrorLogsInputSchema;

  async execute(_input: GetErrorLogsInput): Promise<LogEntry[]> {
    return [
      {
        timestamp: '2026-06-30T09:42:11Z',
        error_code: 'DASH-504',
        message: 'Chart data fetch timed out after 30s',
        service: 'dashboard',
      },
      {
        timestamp: '2026-06-30T09:38:55Z',
        error_code: 'DASH-504',
        message: 'Chart data fetch timed out after 30s',
        service: 'dashboard',
      },
      {
        timestamp: '2026-06-30T08:17:03Z',
        error_code: 'DASH-503',
        message: 'Dashboard service temporarily unavailable',
        service: 'dashboard',
      },
    ];
  }
}
