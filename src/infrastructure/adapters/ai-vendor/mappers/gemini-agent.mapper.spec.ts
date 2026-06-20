import {
  mapDomainToolsToGemini,
  mapDomainMessagesToGemini,
  mapGeminiResponseToDomain,
} from './gemini-agent.mapper';
import {
  AgentToolDefinition,
  AgentMessage,
} from '../../../../application/ports/agent-types';

describe('GeminiAgentMapper', () => {
  describe('mapDomainToolsToGemini', () => {
    it('should map tools to Gemini function declaration formats', () => {
      const tools: AgentToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'OBJECT',
            properties: {
              arg1: { type: 'STRING' },
            },
            required: ['arg1'],
          },
        },
      ];

      const mapped = mapDomainToolsToGemini(tools);
      expect(mapped).toHaveLength(1);
      expect(mapped[0]).toEqual({
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'OBJECT',
          properties: {
            arg1: { type: 'STRING' },
          },
          required: ['arg1'],
        },
      });
    });
  });

  describe('mapDomainMessagesToGemini', () => {
    it('should map string message content and roles', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];

      const mapped = mapDomainMessagesToGemini(messages);
      expect(mapped).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi there' }] },
      ]);
    });

    it('should map block-based message content', () => {
      const messages: AgentMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Thinking...' },
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'calc',
              input: { expr: '2+2' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              name: 'calc',
              content: '{"result": 4}',
            },
          ],
        },
      ];

      const mapped = mapDomainMessagesToGemini(messages);
      expect(mapped).toEqual([
        {
          role: 'model',
          parts: [
            { text: 'Thinking...' },
            {
              functionCall: {
                name: 'calc',
                args: { expr: '2+2' },
                id: 'call_1',
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'calc',
                response: { result: 4 },
              },
            },
          ],
        },
      ]);
    });

    it('should fallback to wrapping content string if tool result is not valid JSON object', () => {
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              name: 'calc',
              content: '4',
            },
          ],
        },
      ];

      const mapped = mapDomainMessagesToGemini(messages);
      expect(mapped[0].parts[0].functionResponse).toEqual({
        name: 'calc',
        response: { result: 4 },
      });
    });
  });

  describe('mapGeminiResponseToDomain', () => {
    it('should parse text parts', () => {
      const response = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Here is the answer.' }],
            },
          },
        ],
      };

      const turn = mapGeminiResponseToDomain(response);
      expect(turn.stopReason).toBe('end_turn');
      expect(turn.content).toEqual([
        { type: 'text', text: 'Here is the answer.' },
      ]);
    });

    it('should parse function calls', () => {
      const response = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Paris' },
                    id: 'call_x',
                  },
                },
              ],
            },
          },
        ],
      };

      const turn = mapGeminiResponseToDomain(response);
      expect(turn.stopReason).toBe('tool_use');
      expect(turn.content).toHaveLength(1);
      expect(turn.content[0]).toEqual({
        type: 'tool_use',
        id: 'call_x',
        name: 'get_weather',
        input: { location: 'Paris' },
      });
    });

    it('should parse functionCalls list (older SDK format)', () => {
      const response = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCalls: [
                    {
                      name: 'get_weather',
                      args: { location: 'London' },
                      id: 'call_y',
                    },
                  ],
                },
              ],
            },
          },
        ],
      };

      const turn = mapGeminiResponseToDomain(response);
      expect(turn.stopReason).toBe('tool_use');
      expect(turn.content[0]).toEqual({
        type: 'tool_use',
        id: 'call_y',
        name: 'get_weather',
        input: { location: 'London' },
      });
    });
  });
});
