/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ReActAgentExecutor } from './react-agent-executor.service';
import { ToolExecutor } from './tool-executor.service';
import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { z } from 'zod';
import { AgentTurn, AgentMessage } from '../ports/agent-types';
import { of } from 'rxjs';

async function runExecutor(
  executor: ReActAgentExecutor,
  systemPrompt: string,
  tools: Tool[],
  messages: AgentMessage[],
  maxTurns?: number,
): Promise<string> {
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    executor.run(systemPrompt, tools, messages, maxTurns).subscribe({
      next: (chunk) => {
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
      },
      error: reject,
      complete: resolve,
    });
  });
  return chunks.join('');
}

describe('ReActAgentExecutor', () => {
  let executor: ReActAgentExecutor;
  let mockClient: jest.Mocked<AIClient>;

  beforeEach(() => {
    mockClient = {
      getAvailableModels: jest.fn(),
      createMessage: jest.fn(),
    };
    const toolExecutor = new ToolExecutor();
    executor = new ReActAgentExecutor(mockClient, toolExecutor);
  });

  it('should return text response directly if no tools are called', async () => {
    mockClient.createMessage.mockReturnValue({
      chunks$: of('Hello, I am ready.'),
      turn$: Promise.resolve(
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
      chunks$: of('Let me check the weather first.'),
      turn$: Promise.resolve(
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
      chunks$: of('It is 22 degrees in Rome.'),
      turn$: Promise.resolve(
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
      chunks$: of(''),
      turn$: Promise.resolve(
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
      chunks$: of('I encountered an error.'),
      turn$: Promise.resolve(
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
      chunks$: of(''),
      turn$: Promise.resolve(
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
      chunks$: of(''),
      turn$: Promise.resolve(
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
      chunks$: of(''),
      turn$: Promise.resolve(
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
      chunks$: of('I am finished.'),
      turn$: Promise.resolve(
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
      chunks$: of(''),
      turn$: Promise.resolve(
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
      'Agent execution stopped: the agent became stuck in a repetitive loop calling tool "get_weather".',
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
      chunks$: of('Checking weather...'),
      turn$: Promise.resolve(turn1),
    });

    // Mock turn 2
    const turn2 = AgentTurn.from({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Weather is 22.' }],
    });
    mockClient.createMessage.mockReturnValueOnce({
      chunks$: of('Weather is 22.'),
      turn$: Promise.resolve(turn2),
    });

    const stream$ = executor.run(
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather' }],
    );

    const chunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      stream$.subscribe({
        next: (chunk) => {
          if (chunk.type === 'text') {
            chunks.push(chunk.text);
          } else if (chunk.type === 'tool_use') {
            chunks.push(
              `[Calling tool: ${chunk.name} with ${JSON.stringify(chunk.input)}]`,
            );
          } else if (chunk.type === 'observation') {
            chunks.push(`Observation: ${chunk.content}`);
          }
        },
        error: reject,
        complete: resolve,
      });
    });

    const fullOutput = chunks.join('');
    expect(fullOutput).toContain('Checking weather...');
    expect(fullOutput).toContain(
      '[Calling tool: get_weather with {"city":"Rome"}]',
    );
    expect(fullOutput).toContain('Observation: {"temp":22}');
    expect(fullOutput).toContain('Weather is 22.');
  });
});
