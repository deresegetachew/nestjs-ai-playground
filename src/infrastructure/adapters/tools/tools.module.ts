import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  SIMPLE_CHATBOT_TOOLS,
  SUPPORT_DESK_TRIAGE_TOOLS,
  BILLING_TOOLS,
  TECH_SUPPORT_TOOLS,
  ACCOUNT_TOOLS,
} from '../../../application/ports/tool.tokens';
import { CalculatorTool } from './calculator/calculator.tool';
import { WeatherTool } from './weather/weather.tool';
import { GetInvoiceTool } from './billing/get-invoice.tool';
import { ListInvoicesTool } from './billing/list-invoices.tool';
import { IssueRefundTool } from './billing/issue-refund.tool';
import { CheckServiceStatusTool } from './tech-support/check-service-status.tool';
import { GetErrorLogsTool } from './tech-support/get-error-logs.tool';
import { CreateTicketTool } from './tech-support/create-ticket.tool';
import { GetAccountTool } from './account/get-account.tool';
import { UpdateEmailTool } from './account/update-email.tool';
import { CancelSubscriptionTool } from './account/cancel-subscription.tool';
import { SupportDeskSpecialistTool } from './support-desk/support-desk-specialist.tool';

@Module({
  imports: [ConfigModule],
  providers: [
    CalculatorTool,
    WeatherTool,
    GetInvoiceTool,
    ListInvoicesTool,
    IssueRefundTool,
    CheckServiceStatusTool,
    GetErrorLogsTool,
    CreateTicketTool,
    GetAccountTool,
    UpdateEmailTool,
    CancelSubscriptionTool,
    SupportDeskSpecialistTool,
    {
      provide: SIMPLE_CHATBOT_TOOLS,
      useFactory: (calc: CalculatorTool, weather: WeatherTool) => [calc, weather],
      inject: [CalculatorTool, WeatherTool],
    },
    {
      provide: SUPPORT_DESK_TRIAGE_TOOLS,
      useFactory: (tool: SupportDeskSpecialistTool) => [tool],
      inject: [SupportDeskSpecialistTool],
    },
    {
      provide: BILLING_TOOLS,
      useFactory: (a: GetInvoiceTool, b: ListInvoicesTool, c: IssueRefundTool) => [a, b, c],
      inject: [GetInvoiceTool, ListInvoicesTool, IssueRefundTool],
    },
    {
      provide: TECH_SUPPORT_TOOLS,
      useFactory: (a: CheckServiceStatusTool, b: GetErrorLogsTool, c: CreateTicketTool) => [a, b, c],
      inject: [CheckServiceStatusTool, GetErrorLogsTool, CreateTicketTool],
    },
    {
      provide: ACCOUNT_TOOLS,
      useFactory: (a: GetAccountTool, b: UpdateEmailTool, c: CancelSubscriptionTool) => [a, b, c],
      inject: [GetAccountTool, UpdateEmailTool, CancelSubscriptionTool],
    },
  ],
  exports: [SIMPLE_CHATBOT_TOOLS, SUPPORT_DESK_TRIAGE_TOOLS, BILLING_TOOLS, TECH_SUPPORT_TOOLS, ACCOUNT_TOOLS],
})
export class ToolsModule {}
