import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Observable } from 'rxjs';
import { AppConfig } from '../../../../config/config.schema';
import { AIModel } from '../../../../domain/models/ai-model.value-object';
import { AIVendor } from '../../../../domain/models/ai-vendor.value-object';
import { AIClient } from '../../../../application/ports/ai-client.port';
import { AgentTurn } from '../../../../application/ports/agent-types';
import { safeInvoke } from '../utils/api-retry';

const OPENAI_MODELS = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast, efficient models.',
  },
  {
    id: 'gpt-5',
    name: 'GPT-5 (Standard)',
    description: 'Next generation LLM.',
  },
  {
    id: 'dall-e-4',
    name: 'DALL-E 4',
    description: 'Advanced creative image generation.',
  },
  {
    id: 'tts-1',
    name: 'OpenAI TTS-1',
    description: 'Fast, affordable text-to-speech. Great for most use cases.',
  },
  {
    id: 'tts-1-hd',
    name: 'OpenAI TTS-1 HD',
    description: 'Higher quality TTS. Slower and slightly more expensive.',
  },
];

@Injectable()
export class OpenAiStrategy implements AIClient {
  private readonly logger = new Logger(OpenAiStrategy.name);
  private client: OpenAI;
  private defaultModel: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const openaiConfig = this.configService.get('openai', { infer: true });
    this.defaultModel =
      this.configService.get('ai.model', { infer: true }) || 'gpt-4o-mini';
    const apiKey = openaiConfig?.apiKey || '';
    if (!apiKey) {
      this.logger.warn(
        'OpenAI API key not found in configuration. OpenAI strategy will be disabled.',
      );
      return;
    }

    // Initialize the official OpenAI Node SDK
    this.client = new OpenAI({
      apiKey,
    });
  }

  getClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        'OpenAI Strategy not initialized. Check API key configuration.',
      );
    }
    return this.client;
  }

  getAvailableModels(): Promise<AIModel[]> {
    return Promise.resolve(
      OPENAI_MODELS.map((m) =>
        AIModel.create({
          id: m.id,
          name: m.name,
          vendor: AIVendor.OPENAI,
        }),
      ),
    );
  }

  async message(prompt: string): Promise<string> {
    const client = this.getClient();
    const response = await safeInvoke(
      () =>
        client.chat.completions.create({
          model: this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
        }),
      this.logger,
    );
    return response.choices[0]?.message?.content || '';
  }

  streamMessage(prompt: string): Observable<string> {
    return new Observable<string>((subscriber) => {
      let active = true;
      const client = this.getClient();
      void (async () => {
        try {
          const stream = await client.chat.completions.create({
            model: this.defaultModel,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          });

          for await (const chunk of stream) {
            if (!active) break;
            subscriber.next(chunk.choices[0]?.delta?.content || '');
          }
          subscriber.complete();
        } catch (error) {
          if (active) {
            subscriber.error(error);
          }
        }
      })();

      return () => {
        active = false;
      };
    });
  }

  createMessage(): Promise<AgentTurn> {
    return Promise.reject(
      new Error('OpenAI Agent support (createMessage) is not yet implemented.'),
    );
  }
}
