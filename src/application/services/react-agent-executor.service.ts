import { Inject, Injectable } from '@nestjs/common';
import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { AgentMessage, AgentContentBlock } from '../ports/agent-types';

@Injectable()
export class ReActAgentExecutor {
  constructor(
    @Inject(AIClient)
    private readonly aiClient: AIClient,
  ) {}

  async run(
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
  ): Promise<{ reply: string; updatedMessages: AgentMessage[] }> {
    const localMessages = [...messages];

    while (true) {
      // 1. Get next turn from LLM via port using pure domain models
      const turn = await this.aiClient.createMessage({
        maxTokens: 1024,
        system: systemPrompt,
        tools: tools,
        messages: [...localMessages],
      });

      // Append assistant's turn
      localMessages.push({ role: 'assistant', content: turn.content });

      if (turn.stopReason === 'end_turn') {
        const textBlock = turn.content.find((b) => b.type === 'text');
        const reply = textBlock && 'text' in textBlock ? textBlock.text : '';
        return { reply, updatedMessages: localMessages };
      }

      // 2. Loop through tool calls requested in this turn
      const results: AgentContentBlock[] = [];
      for (const block of turn.content) {
        if (block.type === 'tool_use') {
          const tool = tools.find((t) => t.name === block.name);
          if (!tool) {
            throw new Error(`Tool ${block.name} is not registered.`);
          }

          // Execute tool
          const output = (await tool.execute(block.input)) as unknown;

          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            name: block.name,
            content: JSON.stringify(output),
          });
        }
      }

      // 3. Append observation list and loop back
      localMessages.push({ role: 'user', content: results });
    }
  }
}
