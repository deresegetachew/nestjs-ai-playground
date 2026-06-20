/* eslint-disable @typescript-eslint/unbound-method */
import { ReActAgentExecutor } from './react-agent-executor.service';
import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';

describe('ReActAgentExecutor', () => {
  let executor: ReActAgentExecutor;
  let mockClient: jest.Mocked<AIClient>;

  beforeEach(() => {
    mockClient = {
      message: jest.fn(),
      streamMessage: jest.fn(),
      getAvailableModels: jest.fn(),
      getClient: jest.fn(),
      createMessage: jest.fn(),
    };
    executor = new ReActAgentExecutor(mockClient);
  });

  it('should return text response directly if no tools are called', async () => {
    mockClient.createMessage.mockResolvedValue({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Hello, I am ready.' }],
    });

    const result = await executor.run(
      'system instructions',
      [],
      [{ role: 'user', content: 'hello' }],
    );

    expect(result.reply).toBe('Hello, I am ready.');
    expect(mockClient.createMessage).toHaveBeenCalledTimes(1);
  });

  it('should run a tool and loop back to the agent with the observation', async () => {
    const mockTool: jest.Mocked<Tool> = {
      name: 'get_weather',
      description: 'Get weather details',
      inputSchema: {},
      execute: jest.fn().mockResolvedValue({ temp: 22 }),
    };

    // First call: agent requests tool call
    mockClient.createMessage.mockResolvedValueOnce({
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
    });

    // Second call: agent returns final reply
    mockClient.createMessage.mockResolvedValueOnce({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'It is 22 degrees in Rome.' }],
    });

    const result = await executor.run(
      'system prompt',
      [mockTool],
      [{ role: 'user', content: 'weather in Rome' }],
    );

    expect(mockTool.execute).toHaveBeenCalledWith({ city: 'Rome' });
    expect(result.reply).toBe('It is 22 degrees in Rome.');
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
});
