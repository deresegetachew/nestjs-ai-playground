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
      const client = service.getClient();
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

  describe('message', () => {
    it('should return text response on successful API call', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'Hello response' });
      const res = await service.message('Hello');
      expect(res).toBe('Hello response');
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        contents: 'Hello',
      });
    });

    it('should throw AuthenticationException when API key is bad (401)', async () => {
      const error = { status: 401, message: 'API key not valid' };
      mockGenerateContent.mockRejectedValue(error);
      await expect(service.message('Hello')).rejects.toThrow(
        AuthenticationException,
      );
    });
  });

  describe('createMessage', () => {
    it('should call mapGeminiResponseToDomain and return AgentTurn', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'response text' }],
            },
          },
        ],
      });

      const turn = await service.createMessage({
        maxTokens: 100,
        tools: [],
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(turn.stopReason).toBe('end_turn');
      expect(turn.content).toEqual([{ type: 'text', text: 'response text' }]);
    });
  });
});
