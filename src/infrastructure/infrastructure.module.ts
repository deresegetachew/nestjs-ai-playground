import { Module } from '@nestjs/common';
import { AIVendorModule } from './adapters/ai-vendor/ai-vendor.module';
import { CliModule } from './adapters/cli/cli.module';

@Module({
  imports: [AIVendorModule, CliModule],
  exports: [AIVendorModule, CliModule],
})
export class InfrastructureModule {}
