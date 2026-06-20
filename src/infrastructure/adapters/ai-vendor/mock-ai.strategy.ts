import { Injectable, Logger } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { AIClient } from '../../../application/ports/ai-client.port';
import { AIModel } from '../../../domain/models/ai-model.value-object';
import { AIVendor } from '../../../domain/models/ai-vendor.value-object';
import { AgentTurn } from '../../../application/ports/agent-types';

@Injectable()
export class MockAiStrategy implements AIClient {
  private readonly logger = new Logger(MockAiStrategy.name);

  getClient(): any {
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

  message(): Promise<string> {
    return Promise.resolve('mock response');
  }

  streamMessage(): Observable<string> {
    return of('mock response');
  }

  createMessage(): Promise<AgentTurn> {
    return Promise.resolve({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'mock response' }],
    });
  }
}
