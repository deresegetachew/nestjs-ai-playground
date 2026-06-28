import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Part } from '@google/genai';

import { AppConfig } from '../../../../config/config.schema';
import { AIModel } from '../../../../domain/models/ai-model.value-object';
import { AIVendor } from '../../../../domain/models/ai-vendor.value-object';
import { AIClient } from '../../../../application/ports/ai-client.port';
import {
  IAgentParams,
  AgentTurn,
  AgentMessage,
} from '../../../../application/ports/agent-types';
import { safeInvoke } from '../utils/api-retry';
import {
  mapDomainMessagesToGemini,
  mapDomainToolsToGemini,
  mapGeminiPartsToTurn,
  mapGeminiError,
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
  readonly defaultModel: string;

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
    chunks: AsyncIterable<string>;
    turnPromise: Promise<AgentTurn>;
  } {
    const client = this.getClient();
    const systemInstruction = params.system;
    const contents = mapDomainMessagesToGemini(params.messages);
    const tools = mapDomainToolsToGemini(params.tools);
    const model = params.model || this.defaultModel;

    this.logger.debug('gemini_request_sent', {
      model,
      messagesCount: contents.length,
      toolsCount: tools.length,
    });

    let resolveTurn: (turn: AgentTurn) => void;
    let rejectTurn: (err: any) => void;
    // Uses the split-stream pattern to handle real-time chunk streaming via `chunks`
    // and metadata/tool-call aggregation via the resolved `turnPromise` promise.
    const turnPromise = new Promise<AgentTurn>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });

    const self = this;
    async function* generateChunks(): AsyncGenerator<string, void, unknown> {
      try {
        const responseStream = await safeInvoke(
          () =>
            client.models.generateContentStream({
              model,
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
          self.logger,
        );

        let aggregatedText = '';
        const toolCallParts: Part[] = [];
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of responseStream) {
          const text = chunk.text;
          if (text) {
            yield text;
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
          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
            outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
          }
        }

        self.logger.debug('gemini_response_received', {
          model,
          textLength: aggregatedText.length,
          toolCallsCount: toolCallParts.length,
        });

        const finalParts: Part[] = [];
        if (aggregatedText) {
          finalParts.push({ text: aggregatedText });
        }
        finalParts.push(...toolCallParts);

        const turnResult = mapGeminiPartsToTurn(finalParts, { inputTokens, outputTokens });
        resolveTurn(turnResult);
      } catch (error) {
        const mappedError = mapGeminiError(error);
        rejectTurn(mappedError);
        throw mappedError;
      }
    }

    return { chunks: generateChunks(), turnPromise };
  }

  async countTokens(messages: AgentMessage[], model?: string): Promise<number> {
    const client = this.getClient();
    const resolvedModel = model || this.defaultModel;
    const contents = mapDomainMessagesToGemini(messages);

    const response = await safeInvoke(
      () =>
        client.models.countTokens({
          model: resolvedModel,
          contents,
        }),
      this.logger,
    );
    return response.totalTokens ?? 0;
  }
}
