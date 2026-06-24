import { Observable } from 'rxjs';
import { z } from 'zod';
import { Tool } from '../ports/tool.interface';
import {
  AgentMessage,
  ToolUseBlock,
  AgentStreamChunk,
} from '../ports/agent-types';
import { ToolExecutor } from './tool-executor.service';
import { sanitiseToolSchema } from '../utils/schema.utils';

export interface ToolCallHistoryEntry {
  tool: string;
  argsHash: string;
}

export interface AgentExecutionState {
  history: ToolCallHistoryEntry[];
  warningInjected: boolean;
  turnsSinceWarning: number;
}

export abstract class BaseAgentExecutor {
  constructor(protected readonly toolExecutor: ToolExecutor) {}

  abstract run(
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
    maxTurns?: number,
  ): Observable<AgentStreamChunk>;

  /**
   * Helper method to map standard domain Tool structures to format expected by AI Clients.
   */
  protected mapToolsToDefinition(tools: Tool[]) {
    return tools.map((t) => {
      const jsonSchema = z.toJSONSchema(t.schema) as Record<string, unknown>;
      return {
        name: t.name,
        description: t.description,
        inputSchema: sanitiseToolSchema(jsonSchema),
      };
    });
  }

  protected createExecutionState(): AgentExecutionState {
    return {
      history: [],
      warningInjected: false,
      turnsSinceWarning: 0,
    };
  }

  protected generateArgsHash(args: unknown): string {
    if (!args) return '';
    try {
      const sortObject = (obj: unknown): unknown => {
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(sortObject);
        }
        const record = obj as Record<string, unknown>;
        return Object.keys(record)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = sortObject(record[key]);
            return result;
          }, {});
      };
      return JSON.stringify(sortObject(args));
    } catch {
      if (typeof args === 'string') return args;
      if (typeof args === 'number' || typeof args === 'boolean')
        return String(args);
      return '[complex object]';
    }
  }

  protected processToolCalls(
    state: AgentExecutionState,
    toolUses: ToolUseBlock[],
  ): { shouldWarn: boolean; shouldTerminate: boolean; offendingTool?: string } {
    let repetitiveDetected = false;
    let offendingTool = '';

    for (const block of toolUses) {
      const hash = this.generateArgsHash(block.input);
      state.history.push({ tool: block.name, argsHash: hash });

      const len = state.history.length;
      if (len >= 2) {
        const last = state.history[len - 1];
        const prev = state.history[len - 2];
        if (last.tool === prev.tool && last.argsHash === prev.argsHash) {
          repetitiveDetected = true;
          offendingTool = block.name;
        }
      }
    }

    if (repetitiveDetected) {
      if (!state.warningInjected) {
        state.warningInjected = true;
        state.turnsSinceWarning = 0;
        return { shouldWarn: true, shouldTerminate: false, offendingTool };
      } else {
        state.turnsSinceWarning++;
        if (state.turnsSinceWarning >= 2) {
          return { shouldWarn: false, shouldTerminate: true, offendingTool };
        }
      }
    } else {
      state.turnsSinceWarning = 0;
    }

    return { shouldWarn: false, shouldTerminate: false };
  }
}
