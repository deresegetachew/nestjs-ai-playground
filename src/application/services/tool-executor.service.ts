import { Injectable } from '@nestjs/common';
import { Tool } from '../ports/tool.interface';
import { AgentContentBlock, AgentTurn } from '../ports/agent-types';

@Injectable()
export class ToolExecutor {
  /**
   * Executes tool calls requested in a turn.
   * Handles Zod validation centrally, execution, and wraps errors into tool results.
   */
  async execute(turn: AgentTurn, tools: Tool[]): Promise<AgentContentBlock[]> {
    const results: AgentContentBlock[] = [];
    for (const block of turn.toolUses) {
      const tool = tools.find((t) => t.name === block.name);
      if (!tool) {
        throw new Error(`Tool ${block.name} is not registered.`);
      }

      try {
        // Validate input using the tool's Zod schema centrally
        const validatedInput = tool.schema.parse(block.input) as unknown;
        // Execute tool with validated input
        const output = (await tool.execute(validatedInput)) as unknown;

        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          name: block.name,
          content: JSON.stringify(output),
        });
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          name: block.name,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }
    return results;
  }
}
