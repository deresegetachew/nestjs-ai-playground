/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ReActAgentExecutor } from './react-agent-executor.service';
import { ToolExecutor } from './tool-executor.service';
import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { z } from 'zod';
import { AgentTurn, AgentMessage } from '../ports/agent-types';

async function* toAsyncIterable(chunks: string[] | string): AsyncGenerator<string, void, unknown> {
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      yield chunk;
    }
  } else {
    yield chunks;
  }
}

async function runExecutor(
  executor: ReActAgentExecutor,
  systemPrompt: string,
  tools: Tool[],
  messages: AgentMessage[],
  maxTurns?: number,
  traceId?: string,
  agentName?: string,
): Promise<string> {
  const chunks: string[] = [];
  try {
    for await (const chunk of executor.run(systemPrompt, tools, messages, maxTurns, traceId, agentName)) {
      if (chunk.type === 'text') {
        chunks.push(chunk.text);
      } else if (chunk.type === 'tool_use') {
        chunks.push(
          `\n[Calling tool: ${chunk.name} with ${JSON.stringify(chunk.input)}]\n`,
        );
      } else if (chunk.type === 'observation') {
        chunks.push(`\nObservation: ${chunk.content}\n`);
      } else if (chunk.type === 'warning') {
        chunks.push(`\n[${chunk.text}]\n`);
      } else if (chunk.type === 'error') {
        chunks.push(`\n${chunk.text}`);
      }
    }
  } catch (err) {
    throw err;
  }
  return chunks.join('');
}

describe('ReActAgentExecutor', () => {
  let executor: ReActAgentExecutor;
  let mockClient: jest.Mocked<AIClient>;

  beforeEach(() => {
    mockClient = {
      getAvailableModels: jest.fn(),
      createMessage: jest.fn(),
      countTokens: jest.fn().mockResolvedValue(10),
    };
    const toolExecutor = new ToolExecutor();
    executor = new ReActAgentExecutor(toolExecutor, mockClient);
  });

  it('should return text response directly if no tools are called', async () => {
    mockClient.createMessage.mockReturnValue({
      chunks: toAsyncIterable('Hello, I am ready.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Hello, I am ready.' }],
        }),
      ),
    });

    const result = await runExecutor(
      executor,
      'system instructions',
      [],
      [{ role: 'user', content: 'hello' }],
      10,
    );

    expect(result).toBe('Hello, I am ready.');
    expect(mockClient.createMessage).toHaveBeenCalledTimes(1);
  });

  it('should run a tool and loop back to the agent with the observation', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // First call: agent requests tool call
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('Let me check the weather first.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            { type: 'text', text: 'Let me check the weather first.' },
            {
              type: 'tool_use',
              id: 'call_abc',
              name: 'get_weather',
              input: { city: 'Rome' },
            },
          ],
        }),
      ),
    });

    // Second call: agent returns final reply
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('It is 22 degrees in Rome.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'It is 22 degrees in Rome.' }],
        }),
      ),
    });

    const result = await runExecutor(
      executor,
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather in Rome' }],
      10,
    );

    expect(mockTool.execute).toHaveBeenCalledWith({ city: 'Rome' });
    expect(result).toContain('It is 22 degrees in Rome.');
    expect(mockClient.createMessage).toHaveBeenCalledTimes(2);

    // Verify messages sent in second turn include the tool results
    const secondTurnCallArgs = mockClient.createMessage.mock.calls[1][0];
    expect(secondTurnCallArgs.messages).toHaveLength(3);
    expect(secondTurnCallArgs.messages[1].role).toBe('assistant');
    expect(secondTurnCallArgs.messages[2].role).toBe('user');
    expect(secondTurnCallArgs.messages[2].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'call_abc',
      name: 'get_weather',
      content: '{"temp":22}',
    });
  });

  it('should handle validation errors and return them to the LLM', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // First call: agent requests tool call but with invalid inputs (city is number instead of string)
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_invalid',
              name: 'get_weather',
              input: { city: 123 },
            },
          ],
        }),
      ),
    });

    // Second call: agent returns final reply after receiving error
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('I encountered an error.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'I encountered an error.' }],
        }),
      ),
    });

    await runExecutor(
      executor,
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather' }],
      10,
    );

    expect(mockTool.execute).not.toHaveBeenCalled();
    expect(mockClient.createMessage).toHaveBeenCalledTimes(2);

    const secondTurnCallArgs: any = mockClient.createMessage.mock.calls[1][0];
    expect(secondTurnCallArgs.messages).toHaveLength(3);
    expect(secondTurnCallArgs.messages[1].role).toBe('assistant');
    expect(secondTurnCallArgs.messages[2].role).toBe('user');
    expect(secondTurnCallArgs.messages[2].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'call_invalid',
      name: 'get_weather',
      content: expect.stringContaining('error'),
    });
  });

  it('should throw an error and stop execution when maxTurns limit is reached', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // Mock createMessage to continuously request tool use
    mockClient.createMessage.mockReturnValue({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_abc',
              name: 'get_weather',
              input: { city: 'Rome' },
            },
          ],
        }),
      ),
    });

    await expect(
      runExecutor(
        executor,
        'system prompt',
        [mockTool],
        [{ role: 'user', content: 'weather' }],
        3, // maxTurns limit
      ),
    ).rejects.toThrow('Agent exceeded maximum number of turns (3).');

    expect(mockClient.createMessage).toHaveBeenCalledTimes(3);
  });

  it('should inject a warning block when a tool is called repetitively with the same arguments', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // Turn 1: agent calls tool get_weather with Rome
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'get_weather',
              input: { city: 'Rome' },
            },
          ],
        }),
      ),
    });

    // Turn 2: agent calls same tool get_weather with Rome (repetition!)
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_2',
              name: 'get_weather',
              input: { city: 'Rome' },
            },
          ],
        }),
      ),
    });

    // Turn 3: agent replies with final text
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('I am finished.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'I am finished.' }],
        }),
      ),
    });

    const result = await runExecutor(
      executor,
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather' }],
      10,
    );

    expect(result).toContain('I am finished.');
    expect(mockClient.createMessage).toHaveBeenCalledTimes(3);

    // Verify messages sent in the third turn include the injected warning alongside the second tool result
    const thirdTurnCallArgs = mockClient.createMessage.mock.calls[2][0];
    expect(thirdTurnCallArgs.messages).toHaveLength(5);
    const secondToolResultMsg = thirdTurnCallArgs.messages[4];
    expect(secondToolResultMsg.role).toBe('user');
    expect(secondToolResultMsg.content).toContainEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(
          'Warning: You have called the tool "get_weather" multiple times',
        ),
      }),
    );
  });

  it('should force termination and return a partial result with explanation when repetition continues after warning', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // Mock createMessage to continuously return the same tool call
    mockClient.createMessage.mockReturnValue({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_stuck',
              name: 'get_weather',
              input: { city: 'Rome' },
            },
          ],
        }),
      ),
    });

    const result = await runExecutor(
      executor,
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather' }],
      10,
    );

    expect(result).toContain(
      'Agent is stuck in a repetitive loop calling tool "get_weather".',
    );
    expect(mockClient.createMessage).toHaveBeenCalledTimes(4);
  });

  it('should run a tool and stream the thought, call event, and observation', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // Mock turn 1
    const turn1 = AgentTurn.from({
      stopReason: 'tool_use',
      content: [
        { type: 'text', text: 'Checking weather...' },
        {
          type: 'tool_use',
          id: 'call_1',
          name: 'get_weather',
          input: { city: 'Rome' },
        },
      ],
    });
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('Checking weather...'),
      turnPromise: Promise.resolve(turn1),
    });

    // Mock turn 2
    const turn2 = AgentTurn.from({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Weather is 22.' }],
    });
    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('Weather is 22.'),
      turnPromise: Promise.resolve(turn2),
    });

    const stream$ = executor.run(
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather' }],
    );

    const chunks: string[] = [];
    for await (const chunk of stream$) {
      if (chunk.type === 'text') {
        chunks.push(chunk.text);
      } else if (chunk.type === 'tool_use') {
        chunks.push(
          `[Calling tool: ${chunk.name} with ${JSON.stringify(chunk.input)}]`,
        );
      } else if (chunk.type === 'observation') {
        chunks.push(`Observation: ${chunk.content}`);
      }
    }

    const fullOutput = chunks.join('');
    expect(fullOutput).toContain('Checking weather...');
    expect(fullOutput).toContain(
      '[Calling tool: get_weather with {"city":"Rome"}]',
    );
    expect(fullOutput).toContain('Observation: {"temp":22}');
    expect(fullOutput).toContain('Weather is 22.');
  });

  it('should bubble up critical systemic errors thrown by tools and halt execution', async () => {
    const schema = z.object({ city: z.string() });
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      schema,
      execute: jest.fn().mockRejectedValue(new Error('Database connection failed')),
    };

    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable(''),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'call_critical_failure',
              name: 'get_weather',
              input: { city: 'Paris' },
            },
          ],
        }),
      ),
    });

    const loggerSpy = jest.spyOn(executor['logger'], 'error').mockImplementation();

    await expect(
      runExecutor(
        executor,
        'system prompt',
        [mockTool],
        [{ role: 'user', content: 'weather' }],
        10,
      ),
    ).rejects.toThrow('Database connection failed');

    expect(mockTool.execute).toHaveBeenCalledTimes(1);
    expect(mockClient.createMessage).toHaveBeenCalledTimes(1); // Aborted after 1st turn
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  it('should timeout if execution takes longer than timeoutMs', async () => {
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'ai.timeoutMs') return 50;
        if (key === 'ai.contextWindowLimit') return 1000;
        return undefined;
      }),
    } as any;

    const schema = z.object({ city: z.string() });
    const mockTool = {
      name: 'get_weather',
      description: 'Get weather',
      schema,
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    const toolExecutor = new ToolExecutor(mockConfig);
    const timeoutExecutor = new ReActAgentExecutor(toolExecutor, mockClient, mockConfig);

    mockClient.createMessage.mockImplementation(() => {
      return {
        chunks: toAsyncIterable(''),
        turnPromise: new Promise((resolve) => setTimeout(() => {
          resolve(AgentTurn.from({
            stopReason: 'tool_use',
            content: [{
              type: 'tool_use',
              id: 'call_1',
              name: 'get_weather',
              input: { city: 'Rome' },
            }],
          }));
        }, 150)),
      };
    });

    await expect(
      runExecutor(
        timeoutExecutor,
        'system prompt',
        [mockTool],
        [{ role: 'user', content: 'test' }],
        10,
      )
    ).rejects.toThrow('Agent execution timed out after 50ms.');
  });

  it('should trim and summarize context if token count exceeds 75% of context window limit', async () => {
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'ai.timeoutMs') return 60000;
        if (key === 'ai.contextWindowLimit') return 100;
        return undefined;
      }),
    } as any;

    const toolExecutor = new ToolExecutor(mockConfig);
    const trimExecutor = new ReActAgentExecutor(toolExecutor, mockClient, mockConfig);

    mockClient.countTokens
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(30);

    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('Summary response.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Summary: they talked about weather.' }],
        }),
      ),
    });

    mockClient.createMessage.mockReturnValueOnce({
      chunks: toAsyncIterable('Main response.'),
      turnPromise: Promise.resolve(
        AgentTurn.from({
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Main response.' }],
        }),
      ),
    });

    const history: AgentMessage[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply1' }] },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply2' }] },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: [{ type: 'text', text: 'reply3' }] },
    ];

    const result = await runExecutor(
      trimExecutor,
      'system prompt',
      [],
      history,
      10,
    );

    expect(result).toBe('Main response.');
    
    const summarizationCallArgs = mockClient.createMessage.mock.calls[0][0];
    expect(summarizationCallArgs.system).toBe(
      'Summarise the key facts and decisions from this conversation in 200 words.'
    );
    expect(summarizationCallArgs.messages[0].content).toContain('msg1');
    
    const mainCallArgs = mockClient.createMessage.mock.calls[1][0];
    expect(mainCallArgs.messages[0].role).toBe('user');
    expect(mainCallArgs.messages[0].content).toBe(
      'Previous conversation summary: Summary: they talked about weather.'
    );
    expect(mainCallArgs.messages).toHaveLength(6);
  });

  describe('trace context propagation', () => {
    /**
     * Resolves the runId that run() chose by spying on the first logger.log
     * call whose event is 'run_start'.
     */
    function captureRunId(exec: ReActAgentExecutor): jest.SpyInstance {
      return jest.spyOn((exec as any).logger, 'log');
    }

    function getRunIdFromSpy(spy: jest.SpyInstance): string | undefined {
      const runStartCall = spy.mock.calls.find(
        (args: any[]) => args[0]?.event === 'run_start',
      );
      return runStartCall?.[0]?.runId;
    }

    beforeEach(() => {
      mockClient.createMessage.mockReturnValue({
        chunks: toAsyncIterable('ok'),
        turnPromise: Promise.resolve(
          AgentTurn.from({
            stopReason: 'end_turn',
            content: [{ type: 'text', text: 'ok' }],
          }),
        ),
      });
    });

    it('should use the provided trace ID as runId when traceId is passed', async () => {
      const knownTraceId = 'trace-test-id-abc-123';
      const spy = captureRunId(executor);

      await runExecutor(executor, 'system', [], [{ role: 'user', content: 'hi' }], 10, knownTraceId);

      expect(getRunIdFromSpy(spy)).toBe(knownTraceId);
    });

    it('should log the provided agent name or default to simple-chatbot', async () => {
      const spy = captureRunId(executor);

      await runExecutor(
        executor,
        'system',
        [],
        [{ role: 'user', content: 'hi' }],
        10,
        undefined,
        'test-agent-name',
      );

      expect(spy.mock.calls[0][0].agentName).toBe('test-agent-name');

      await runExecutor(
        executor,
        'system',
        [],
        [{ role: 'user', content: 'hi' }],
      );

      expect(spy.mock.calls[4][0].agentName).toBe('simple-chatbot');
    });

    it('should fall back to a generated UUID when no trace context is active', async () => {
      const spy = captureRunId(executor);

      // Called with no runWithTrace wrapper — getTraceId() returns undefined.
      await runExecutor(executor, 'system', [], [{ role: 'user', content: 'hi' }]);

      const runId = getRunIdFromSpy(spy);
      expect(runId).toBeDefined();
      // UUID v4 pattern
      expect(runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('stream classification', () => {
    it('should classify raw chunks starting with Thought: as thought chunks and split final answer', async () => {
      mockClient.createMessage.mockReturnValue({
        chunks: toAsyncIterable([
          'Thought: I need ',
          'to calculate 2+2.\n',
          'Final Answer: The ',
          'result is 4.',
        ]),
        turnPromise: Promise.resolve(
          AgentTurn.from({
            stopReason: 'end_turn',
            content: [
              { type: 'text', text: 'Thought: I need to calculate 2+2.\nFinal Answer: The result is 4.' }
            ],
          }),
        ),
      });

      const stream$ = executor.run(
        'system prompt',
        [],
        [{ role: 'user', content: 'calculate' }],
      );

      const yieldedChunks: { type: string; text?: string }[] = [];
      for await (const chunk of stream$) {
        if (chunk.type === 'thought' || chunk.type === 'text') {
          yieldedChunks.push({ type: chunk.type, text: chunk.text });
        }
      }

      expect(yieldedChunks).toEqual([
        { type: 'thought', text: 'I need ' },
        { type: 'thought', text: 'to calculate 2+2.\n' },
        { type: 'text', text: 'The ' },
        { type: 'text', text: 'result is 4.' },
      ]);
    });

    it('should classify raw chunks without Thought: prefix directly as text chunks', async () => {
      mockClient.createMessage.mockReturnValue({
        chunks: toAsyncIterable([
          'Once upon ',
          'a time...'
        ]),
        turnPromise: Promise.resolve(
          AgentTurn.from({
            stopReason: 'end_turn',
            content: [{ type: 'text', text: 'Once upon a time...' }],
          }),
        ),
      });

      const stream$ = executor.run(
        'system prompt',
        [],
        [{ role: 'user', content: 'story' }],
      );

      const yieldedChunks: { type: string; text?: string }[] = [];
      for await (const chunk of stream$) {
        if (chunk.type === 'thought' || chunk.type === 'text') {
          yieldedChunks.push({ type: chunk.type, text: chunk.text });
        }
      }

      expect(yieldedChunks).toEqual([
        { type: 'text', text: 'Once upon ' },
        { type: 'text', text: 'a time...' },
      ]);
    });
  });
});
