import { Global, Module } from '@nestjs/common';
import { AIVendorModule } from './adapters/ai-vendor/ai-vendor.module';
import { CliModule } from './adapters/cli/cli.module';
import { ToolsModule } from './adapters/tools/tools.module';
import { SupportDeskModule } from './adapters/support-desk/support-desk.module';
import { FileConversationRepository } from './adapters/persistence/file-conversation.repository';
import { CONVERSATION_REPOSITORY } from '../domain/ports/conversation-repository.port';

@Global()
@Module({
  imports: [AIVendorModule, CliModule, ToolsModule, SupportDeskModule],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: FileConversationRepository,
    },
  ],
  exports: [AIVendorModule, CliModule, ToolsModule, SupportDeskModule, CONVERSATION_REPOSITORY],
})
export class InfrastructureModule {}
