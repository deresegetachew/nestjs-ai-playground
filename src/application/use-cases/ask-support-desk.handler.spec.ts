import { Test, TestingModule } from '@nestjs/testing';
import { AskSupportDeskHandler } from './ask-support-desk.handler';
import { AskSupportDeskCommand } from '../commands/ask-support-desk.command';
import { TriageAgentExecutor } from '../services/triage-agent-executor.service';
import { ReActAgentExecutor } from '../services/react-agent-executor.service';
import { AgentConfigFactory } from '../services/agent-config-factory.service';
import { SUPPORT_DESK_TRIAGE_TOOLS } from '../ports/tool.tokens';
import { CONVERSATION_REPOSITORY } from '../../domain/ports/conversation-repository.port';
import { AgentConfig, AgentKey } from '../ports/agent-config.interface';
import { AgentStreamChunk, LlmModel } from '../ports/agent-types';

const billingConfig: AgentConfig = {
  key: AgentKey.Billing,
  systemPrompt: 'You are a billing specialist.',
  tools: [],
  maxTurns: 8,
  model: LlmModel.GeminiFlash,
  temperature: 0.1,
};

const techSupportConfig: AgentConfig = {
  key: AgentKey.TechSupport,
  systemPrompt: 'You are a tech support specialist.',
  tools: [],
  maxTurns: 10,
  model: LlmModel.GeminiFlash,
  temperature: 0.1,
};

describe('AskSupportDeskHandler', () => {
  let handler: AskSupportDeskHandler;
  let mockTriageExecutor: { run: jest.Mock };
  let mockReactExecutor: { run: jest.Mock };
  let mockFactory: { get: jest.Mock };
  let mockRepo: { findById: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    mockTriageExecutor = { run: jest.fn() };
    mockReactExecutor = { run: jest.fn() };
    mockFactory = {
      get: jest.fn((key: AgentKey) => {
        if (key === AgentKey.Billing) return billingConfig;
        if (key === AgentKey.TechSupport) return techSupportConfig;
        throw new Error(`No specialist registered for key: ${key}`);
      }),
    };
    mockRepo = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskSupportDeskHandler,
        { provide: TriageAgentExecutor, useValue: mockTriageExecutor },
        { provide: ReActAgentExecutor, useValue: mockReactExecutor },
        { provide: AgentConfigFactory, useValue: mockFactory },
        { provide: SUPPORT_DESK_TRIAGE_TOOLS, useValue: [] },
        { provide: CONVERSATION_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    handler = module.get<AskSupportDeskHandler>(AskSupportDeskHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  async function collectChunks(message = 'help me'): Promise<AgentStreamChunk[]> {
    const stream = await handler.execute(new AskSupportDeskCommand(message, 'conv-1'));
    const chunks: AgentStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }

  describe('single specialist routing', () => {
    it('emits routing_decision → specialist_start → specialist chunks in order', async () => {
      async function* triage() {
        yield { type: 'routing_decision' as const, specialists: [AgentKey.Billing], reason: 'billing issue' };
      }
      async function* specialist() {
        yield { type: 'text' as const, text: 'Your invoice is $49.' };
      }
      mockTriageExecutor.run.mockReturnValue(triage());
      mockReactExecutor.run.mockReturnValue(specialist());

      const chunks = await collectChunks();

      expect(chunks[0]).toEqual({ type: 'routing_decision', specialists: [AgentKey.Billing], reason: 'billing issue' });
      expect(chunks[1]).toEqual({ type: 'specialist_start', specialist: AgentKey.Billing });
      expect(chunks[2]).toEqual({ type: 'text', text: 'Your invoice is $49.' });
    });

    it('calls reactExecutor with billing specialist config', async () => {
      async function* triage() {
        yield { type: 'routing_decision' as const, specialists: [AgentKey.Billing], reason: 'billing' };
      }
      async function* specialist() { /* empty */ }
      mockTriageExecutor.run.mockReturnValue(triage());
      mockReactExecutor.run.mockReturnValue(specialist());

      await collectChunks();

      expect(mockReactExecutor.run).toHaveBeenCalledTimes(1);
      expect(mockReactExecutor.run).toHaveBeenCalledWith(
        billingConfig.systemPrompt,
        billingConfig.tools,
        expect.any(Array),
        billingConfig.maxTurns,
        undefined,
        'specialist-billing',
        billingConfig.model,
        billingConfig.temperature,
      );
    });
  });

  describe('multi-specialist routing', () => {
    it('emits both specialists sequentially in routing order', async () => {
      async function* triage() {
        yield { type: 'routing_decision' as const, specialists: [AgentKey.Billing, AgentKey.TechSupport], reason: 'billing and tech' };
      }
      async function* billingSpecialist() {
        yield { type: 'text' as const, text: 'billing answer' };
      }
      async function* techSpecialist() {
        yield { type: 'text' as const, text: 'tech answer' };
      }
      mockTriageExecutor.run.mockReturnValue(triage());
      mockReactExecutor.run
        .mockReturnValueOnce(billingSpecialist())
        .mockReturnValueOnce(techSpecialist());

      const chunks = await collectChunks();

      expect(chunks.map(c => c.type)).toEqual([
        'routing_decision',
        'specialist_start',
        'text',
        'specialist_start',
        'text',
      ]);

      const [, firstStart, , secondStart] = chunks;
      expect(firstStart).toEqual({ type: 'specialist_start', specialist: AgentKey.Billing });
      expect(secondStart).toEqual({ type: 'specialist_start', specialist: AgentKey.TechSupport });
    });

    it('calls reactExecutor once per specialist with correct configs', async () => {
      async function* triage() {
        yield { type: 'routing_decision' as const, specialists: [AgentKey.Billing, AgentKey.TechSupport], reason: 'both' };
      }
      async function* empty() { /* empty */ }
      mockTriageExecutor.run.mockReturnValue(triage());
      mockReactExecutor.run
        .mockReturnValueOnce(empty())
        .mockReturnValueOnce(empty());

      await collectChunks();

      expect(mockReactExecutor.run).toHaveBeenCalledTimes(2);
      expect(mockReactExecutor.run).toHaveBeenNthCalledWith(
        1,
        billingConfig.systemPrompt,
        billingConfig.tools,
        expect.any(Array),
        billingConfig.maxTurns,
        undefined,
        'specialist-billing',
        billingConfig.model,
        billingConfig.temperature,
      );
      expect(mockReactExecutor.run).toHaveBeenNthCalledWith(
        2,
        techSupportConfig.systemPrompt,
        techSupportConfig.tools,
        expect.any(Array),
        techSupportConfig.maxTurns,
        undefined,
        'specialist-tech-support',
        techSupportConfig.model,
        techSupportConfig.temperature,
      );
    });
  });

  describe('triage chunk pass-through', () => {
    it('forwards thought and turn_completed chunks from triage before specialist runs', async () => {
      async function* triage() {
        yield { type: 'thought' as const, text: 'analysing message...' };
        yield { type: 'turn_completed' as const, isEnd: false };
        yield { type: 'routing_decision' as const, specialists: [AgentKey.Billing], reason: 'billing' };
      }
      async function* specialist() {
        yield { type: 'text' as const, text: 'resolved' };
      }
      mockTriageExecutor.run.mockReturnValue(triage());
      mockReactExecutor.run.mockReturnValue(specialist());

      const chunks = await collectChunks();

      expect(chunks[0]).toMatchObject({ type: 'thought', text: 'analysing message...' });
      expect(chunks[1]).toMatchObject({ type: 'turn_completed', isEnd: false });
      expect(chunks[2]).toMatchObject({ type: 'routing_decision' });
      expect(chunks[3]).toMatchObject({ type: 'specialist_start', specialist: AgentKey.Billing });
      expect(chunks[4]).toMatchObject({ type: 'text', text: 'resolved' });
    });
  });

  describe('routing failure', () => {
    it('yields error chunk and does not call reactExecutor when triage emits no routing_decision', async () => {
      async function* triage() {
        yield { type: 'thought' as const, text: 'thinking...' };
      }
      mockTriageExecutor.run.mockReturnValue(triage());

      const chunks = await collectChunks();

      const errorChunk = chunks.find(c => c.type === 'error');
      expect(errorChunk).toBeDefined();
      expect((errorChunk as Extract<AgentStreamChunk, { type: 'error' }>).text).toMatch(/triage failed/i);
      expect(mockReactExecutor.run).not.toHaveBeenCalled();
    });

    it('stops after error chunk with no further output', async () => {
      async function* triage() { /* yields nothing */ }
      mockTriageExecutor.run.mockReturnValue(triage());

      const chunks = await collectChunks();

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });
  });
});
