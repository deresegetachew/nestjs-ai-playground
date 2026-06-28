import { Injectable, Logger } from '@nestjs/common';

import { AIClient } from '../../../application/ports/ai-client.port';
import { AIModel } from '../../../domain/models/ai-model.value-object';
import { AIVendor } from '../../../domain/models/ai-vendor.value-object';
import {
  AgentTurn,
  IAgentParams,
  AgentMessage,
} from '../../../application/ports/agent-types';

@Injectable()
export class MockAiStrategy implements AIClient {
  private readonly logger = new Logger(MockAiStrategy.name);

  private getClient(): any {
    return {
      models: {
        generateContent: jest.fn(),
        generateContentStream: jest.fn(),
      },
    };
  }

  getAvailableModels(): Promise<AIModel[]> {
    return Promise.resolve([
      AIModel.create({
        id: 'mock-model-1',
        name: 'Mock Model 1',
        vendor: AIVendor.GEMINI,
      }),
    ]);
  }

  createMessage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: IAgentParams,
  ): {
    chunks: AsyncIterable<string>;
    turnPromise: Promise<AgentTurn>;
  } {
    const turn = AgentTurn.from({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'mock response' }],
    });

    async function* mockGenerator(): AsyncGenerator<string, void, unknown> {
      yield 'mock response';
    }

    return {
      chunks: mockGenerator(),
      turnPromise: Promise.resolve(turn),
    };
  }

  async countTokens(messages: AgentMessage[], model?: string): Promise<number> {
    return 0;
  }
}
