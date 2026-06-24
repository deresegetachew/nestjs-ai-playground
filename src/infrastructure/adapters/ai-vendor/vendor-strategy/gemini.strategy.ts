import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Part } from '@google/genai';
import { Observable, Subject } from 'rxjs';
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
  mapGeminiPartsToTurn,
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

  private getClient(): GoogleGenAI {
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

  createMessage(params: IAgentParams): {
    chunks$: Observable<string>;
    turn$: Promise<AgentTurn>;
  } {
    const client = this.getClient();
    const systemInstruction = params.system;
    const contents = mapDomainMessagesToGemini(params.messages);
    const tools = mapDomainToolsToGemini(params.tools);

    const subject = new Subject<string>();

    const turn$ = (async () => {
      try {
        const responseStream = await safeInvoke(
          () =>
            client.models.generateContentStream({
              model: this.defaultModel,
              contents,
              config: {
                systemInstruction,
                maxOutputTokens: params.maxTokens,
                tools:
                  tools.length > 0
                    ? [{ functionDeclarations: tools }]
                    : undefined,
              },
            }),
          this.logger,
        );

        let aggregatedText = '';
        const toolCallParts: Part[] = [];

        for await (const chunk of responseStream) {
          const text = chunk.text;
          if (text) {
            subject.next(text);
            aggregatedText += text;
          }
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.functionCall) {
                toolCallParts.push(part);
              }
            }
          }
        }

        // NOTE: The ordering here is crucial. We must call subject.complete() (completing chunks$)
        // BEFORE returning the AgentTurn (resolving turn$). This guarantees that any stream
        // subscription hooks in the executor finish executing and cleaning up before the
        // main execution loop is allowed to resume with the parsed AgentTurn promise.
        subject.complete();

        const finalParts: Part[] = [];
        if (aggregatedText) {
          finalParts.push({ text: aggregatedText });
        }
        finalParts.push(...toolCallParts);

        return mapGeminiPartsToTurn(finalParts);
      } catch (error) {
        subject.error(error);
        throw error;
      }
    })();

    return { chunks$: subject.asObservable(), turn$ };
  }
}
