import { Module } from '@nestjs/common';
import { AIVendorModule } from './adapters/ai-vendor/ai-vendor.module';
import { CliModule } from './adapters/cli/cli.module';
import { ToolsModule } from './adapters/tools/tools.module';

@Module({
  imports: [AIVendorModule, CliModule, ToolsModule],
  exports: [AIVendorModule, CliModule, ToolsModule],
})
export class InfrastructureModule {}
