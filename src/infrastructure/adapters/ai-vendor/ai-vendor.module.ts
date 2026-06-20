import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/config.schema';

import { AIClient } from '../../../application/ports/ai-client.port';
import { AIVendor } from '../../../domain/models/ai-vendor.value-object';
import { GeminiStrategy } from './vendor-strategy/gemini.strategy';
import { OpenAiStrategy } from './vendor-strategy/openai.strategy';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    OpenAiStrategy,
    GeminiStrategy,
    {
      provide: AIClient,
      useFactory: (
        configService: ConfigService<AppConfig>,
        gemini: GeminiStrategy,
        openai: OpenAiStrategy,
      ) => {
        const aiConfig = configService.get('ai', { infer: true });
        const vendorName = aiConfig?.vendor || 'gemini';
        const vendor = AIVendor.fromString(vendorName);
        if (vendor === AIVendor.OPENAI) {
          return openai;
        }
        return gemini;
      },
      inject: [ConfigService, GeminiStrategy, OpenAiStrategy],
    },
  ],
  exports: [AIClient, GeminiStrategy],
})
export class AIVendorModule {}
