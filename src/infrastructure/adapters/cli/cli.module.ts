import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ShellRunner } from './shell-runner/shell.runner';
import { SimpleChatbotRunner } from './simple-chatbot-runner/simple-chatbot.runner';
import { SupportDeskRunner } from './support-desk-runner/support-desk.runner';
import { ApplicationModule } from '../../../application/application.module';

@Module({
  imports: [ApplicationModule, CqrsModule],
  providers: [ShellRunner, SimpleChatbotRunner, SupportDeskRunner],
  exports: [ShellRunner, SimpleChatbotRunner, SupportDeskRunner],
})
export class CliModule {}
