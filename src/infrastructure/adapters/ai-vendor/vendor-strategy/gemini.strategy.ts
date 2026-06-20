import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Observable } from 'rxjs';
import { AppConfig } from '../../../../config/config.schema';
import { AIModel } from '../../../../domain/models/ai-model.value-object';
import { AIVendor } from '../../../../domain/models/ai-vendor.value-object';
import { AIClient } from '../../../../application/ports/ai-client.port';
import {
  IAgentParams,
  AgentTurn,
} from '../../../../application/ports/agent-types';
import { safeInvoke } from '../utils/api-retry';
import {
  mapDomainMessagesToGemini,
  mapDomainToolsToGemini,
  mapGeminiResponseToDomain,
} from '../mappers/gemini-agent.mapper';

const GEMINI_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    isDefault: true,
    description: 'Advanced image generation and precise editing.',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    isDefault: true,
    description: 'Fast and efficient for everyday tasks.',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Powerful reasoning for complex problems.',
  },
  {
    id: 'gemini-2.5-flash-preview-tts',
    name: 'Gemini 2.5 Flash TTS',
    supportedVoices: [
      {
        id: 'Sulafat',
        name: 'Sulafat',
        gender: 'female',
        description: 'Female Voice',
      },
      {
        id: 'Aoede',
        name: 'Aoede',
        gender: 'female',
        description: 'Female Voice',
      },
      {
        id: 'Kore',
        name: 'Kore',
        gender: 'female',
        description: 'Female Voice',
      },
      {
        id: 'Leda',
        name: 'Leda',
        gender: 'female',
        description: 'Female Voice',
      },
      {
        id: 'Callirrhoe',
        name: 'Callirrhoe',
        gender: 'female',
        description: 'Female Voice',
      },
      { id: 'Puck', name: 'Puck', gender: 'male', description: 'Male Voice' },
      {
        id: 'Charon',
        name: 'Charon',
        gender: 'male',
        description: 'Male Voice',
      },
      {
        id: 'Fenrir',
        name: 'Fenrir',
        gender: 'male',
        description: 'Male Voice',
      },
      { id: 'Orus', name: 'Orus', gender: 'male', description: 'Male Voice' },
      {
        id: 'Iapetus',
        name: 'Iapetus',
        gender: 'male',
        description: 'Male Voice',
      },
    ],
    description: 'Low-latency, high-quality audio generation.',
  },
];

@Injectable()
export class GeminiStrategy implements AIClient {
  private readonly logger = new Logger(GeminiStrategy.name);
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const apiKey = this.configService.get('gemini.apiKey', { infer: true });
    this.defaultModel =
      this.configService.get('ai.model', { infer: true }) || 'gemini-2.0-flash';
    if (!apiKey) {
      this.logger.warn(
        'Gemini API key not found in configuration. Gemini strategy will be disabled.',
      );
      return;
    }

    // Initialize the Google Gen AI SDK
    this.client = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta', // Required for Gemini 2.5 and TTS support
    });
  }

  getClient(): GoogleGenAI {
    if (!this.client) {
      throw new Error(
        'Gemini Strategy not initialized. Check API key configuration.',
      );
    }
    return this.client;
  }

  getAvailableModels(): Promise<AIModel[]> {
    return Promise.resolve(
      GEMINI_MODELS.map((m) =>
        AIModel.create({
          id: m.id,
          name: m.name,
          vendor: AIVendor.GEMINI,
          supportedVoices: m.supportedVoices,
        }),
      ),
    );
  }

  async message(prompt: string): Promise<string> {
    const client = this.getClient();
    const response = await safeInvoke(
      () =>
        client.models.generateContent({
          model: this.defaultModel,
          contents: prompt,
        }),
      this.logger,
    );
    return response.text || '';
  }

  streamMessage(prompt: string): Observable<string> {
    return new Observable<string>((subscriber) => {
      let active = true;
      const client = this.getClient();
      void (async () => {
        try {
          const responseStream = await client.models.generateContentStream({
            model: this.defaultModel,
            contents: prompt,
          });

          for await (const chunk of responseStream) {
            if (!active) break;
            subscriber.next(chunk.text || '');
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

  async createMessage(params: IAgentParams): Promise<AgentTurn> {
    const client = this.getClient();

    const contents = mapDomainMessagesToGemini(params.messages);
    const tools = mapDomainToolsToGemini(params.tools);

    const response = await safeInvoke(
      () =>
        client.models.generateContent({
          model: this.defaultModel,
          contents,
          config: {
            systemInstruction: params.system,
            maxOutputTokens: params.maxTokens,
            tools:
              tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
          },
        }),
      this.logger,
    );

    return mapGeminiResponseToDomain(response);
  }
}
