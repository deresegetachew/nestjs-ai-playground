import {
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
  Part,
} from '@google/genai';
import {
  AgentMessage,
  AgentContentBlock,
  AgentTurn,
  AgentToolDefinition,
} from '../../../../application/ports/agent-types';
import { sanitiseToolSchema } from '../../../../application/utils/schema.utils';


interface LegacyPart {
  functionCalls?: Array<{
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  }>;
}

/**
 * Maps domain agent tool definitions to Gemini FunctionDeclarations.
 */
export function mapDomainToolsToGemini(
  tools: AgentToolDefinition[],
): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>,
  }));
}

/**
 * Maps domain messages to Gemini Content structures.
 */
export function mapDomainMessagesToGemini(messages: AgentMessage[]): Content[] {
  return messages.map((msg) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    let parts: Part[] = [];

    if (typeof msg.content === 'string') {
      parts = [{ text: msg.content }];
    } else if (Array.isArray(msg.content)) {
      parts = msg.content.map((block) => {
        if (block.type === 'text') {
          return { text: block.text };
        } else if (block.type === 'tool_use') {
          return {
            functionCall: {
              name: block.name,
              args: block.input as Record<string, unknown>,
              id: block.id,
            },
          };
        } else if (block.type === 'tool_result') {
          let responseObj: unknown;
          try {
            responseObj = JSON.parse(block.content) as unknown;
          } catch {
            responseObj = { result: block.content };
          }
          if (typeof responseObj !== 'object' || responseObj === null) {
            responseObj = { result: responseObj };
          }
          return {
            functionResponse: {
              name: block.name,
              response: responseObj as Record<string, unknown>,
            },
          };
        }
        return {};
      });
    }

    return { role, parts };
  });
}

/**
 * Maps a list of Gemini Parts directly to a domain AgentTurn.
 */
export function mapGeminiPartsToTurn(parts: Part[]): AgentTurn {
  const contentBlocks: AgentContentBlock[] = [];

  for (const part of parts) {
    if (part.text) {
      contentBlocks.push({
        type: 'text',
        text: part.text,
      });
    }
    const legacyPart = part as unknown as LegacyPart;
    if (part.functionCall && part.functionCall.name) {
      contentBlocks.push({
        type: 'tool_use',
        id:
          part.functionCall.id ||
          `call_${Math.random().toString(36).substr(2, 9)}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    } else if (
      legacyPart.functionCalls &&
      Array.isArray(legacyPart.functionCalls)
    ) {
      for (const call of legacyPart.functionCalls) {
        if (call && call.name) {
          contentBlocks.push({
            type: 'tool_use',
            id: call.id || `call_${Math.random().toString(36).substr(2, 9)}`,
            name: call.name,
            input: call.args || {},
          });
        }
      }
    }
  }

  const hasToolUse = contentBlocks.some((b) => b.type === 'tool_use');
  return new AgentTurn(hasToolUse ? 'tool_use' : 'end_turn', contentBlocks);
}

/**
 * Maps a Gemini response to a domain AgentTurn.
 */
export function mapGeminiResponseToDomain(
  response: GenerateContentResponse,
): AgentTurn {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const turn = mapGeminiPartsToTurn(parts);

  // Fallback if no parts parsed but text field has content
  if (turn.content.length === 0 && response.text) {
    return new AgentTurn('end_turn', [
      {
        type: 'text',
        text: response.text,
      },
    ]);
  }

  return turn;
}
