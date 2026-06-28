import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiStrategy } from './gemini.strategy';
import { AIVendor } from '../../../../domain/models/ai-vendor.value-object';
import { AuthenticationException } from '../../../../application/exceptions/ai-client.exception';

// Mock the GoogleGenAI class
const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: mockGenerateContentStream,
        },
      };
    }),
  };
});

describe('GeminiStrategy', () => {
  let service: GeminiStrategy;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'gemini.apiKey') return 'test-api-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GeminiStrategy>(GeminiStrategy);

    // Reset mocks
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    it('should return the GoogleGenAI instance', () => {
      const client = (service as any).getClient();
      expect(client).toBeDefined();
      expect(client.models).toBeDefined();
    });
  });

  describe('getAvailableModels', () => {
    it('should return static GEMINI_MODELS', async () => {
      const models = await service.getAvailableModels();
      expect(models.length).toBe(4);
      expect(models[0].id).toBe('gemini-2.5-flash-image');
      expect(models[0].vendor).toBe(AIVendor.GEMINI);
    });
  });

  describe('createMessage', () => {
    it('should return AgentTurn on successful API call', async () => {
      const mockResponseStream = {
        response: Promise.resolve({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello response' }],
              },
            },
          ],
        }),
        [Symbol.asyncIterator]: async function* () {
          await Promise.resolve();
          yield { text: 'Hello response' };
        },
      };
      mockGenerateContentStream.mockResolvedValue(mockResponseStream);

      const { chunks, turnPromise } = service.createMessage({
        maxTokens: 1024,
        tools: [],
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const chunksResult: string[] = [];
      for await (const chunk of chunks) {
        chunksResult.push(chunk);
      }
      const turnResult = await turnPromise;

      expect(turnResult.reply).toBe('Hello response');
      expect(chunksResult).toEqual(['Hello response']);
      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          systemInstruction: undefined,
          maxOutputTokens: 1024,
          tools: undefined,
        },
      });
    });

    it('should extract system instruction and filter it out of contents', async () => {
      const mockResponseStream = {
        response: Promise.resolve({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello response' }],
              },
            },
          ],
        }),
        [Symbol.asyncIterator]: async function* () {
          await Promise.resolve();
          yield { text: 'Hello response' };
        },
      };
      mockGenerateContentStream.mockResolvedValue(mockResponseStream);

      const { chunks, turnPromise } = service.createMessage({
        maxTokens: 1024,
        system: 'You are a helper.',
        tools: [],
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const chunksResult: string[] = [];
      for await (const chunk of chunks) {
        chunksResult.push(chunk);
      }
      const turnResult = await turnPromise;

      expect(turnResult.reply).toBe('Hello response');
      expect(chunksResult).toEqual(['Hello response']);
      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          systemInstruction: 'You are a helper.',
          maxOutputTokens: 1024,
          tools: undefined,
        },
      });
    });

    it('should throw AuthenticationException when API key is bad (401)', async () => {
      const error = { status: 401, message: 'API key not valid' };
      mockGenerateContentStream.mockRejectedValue(error);

      const { chunks, turnPromise } = service.createMessage({
        maxTokens: 1024,
        tools: [],
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const consumeChunks = async () => {
        for await (const _ of chunks) {}
      };

      await Promise.all([
        expect(turnPromise).rejects.toThrow(AuthenticationException),
        expect(consumeChunks()).rejects.toThrow(AuthenticationException),
      ]);
    });

    it('should return async iterable and stream text chunks', async () => {
      const mockResponseStream = {
        response: Promise.resolve({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'streamed response' }],
              },
            },
          ],
        }),
        [Symbol.asyncIterator]: async function* () {
          await Promise.resolve();
          yield { text: 'streamed ' };
          yield { text: 'response' };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockResponseStream);

      const { chunks, turnPromise } = service.createMessage({
        maxTokens: 100,
        tools: [],
        messages: [{ role: 'user', content: 'hello' }],
      });

      const chunksResult: string[] = [];
      for await (const val of chunks) {
        chunksResult.push(val);
      }

      const turnResult = await turnPromise;
      expect(chunksResult).toEqual(['streamed ', 'response']);
      expect(turnResult.reply).toBe('streamed response');
    });
  });
});
