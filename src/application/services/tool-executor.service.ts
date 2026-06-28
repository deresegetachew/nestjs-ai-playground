import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tool } from '../ports/tool.interface';
import { AgentContentBlock, AgentTurn } from '../ports/agent-types';
import { ZodError } from 'zod';
import { AppConfig } from '../../config/config.schema';
import { loadConfig } from '../../config/load-config';
import { withTimeout } from '../utils/timeout.utils';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);
  private toolTimeoutMs = 15000;

  constructor(
    @Optional()
    private readonly configService?: ConfigService<AppConfig>,
  ) {
    try {
      if (this.configService) {
        const val = this.configService.get('ai.toolTimeoutMs', { infer: true });
        if (val !== undefined) {
          this.toolTimeoutMs = val;
        }
      } else {
        const config = loadConfig();
        this.toolTimeoutMs = config.ai.toolTimeoutMs;
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Executes tool calls requested in a turn.
   * Handles Zod validation centrally, execution, and wraps errors into tool results.
   */
  async execute(
    turn: AgentTurn,
    tools: Tool[],
    runId: string,
    turnNumber: number,
    agentName?: string,
  ): Promise<AgentContentBlock[]> {
    const results: AgentContentBlock[] = [];
    for (const block of turn.toolUses) {
      const tool = tools.find((t) => t.name === block.name);
      if (!tool) {
        throw new Error(`Tool ${block.name} is not registered.`);
      }

      const t0 = Date.now();
      this.logger.log({
        event: 'tool_call',
        runId,
        agentName,
        turn: turnNumber,
        toolName: block.name,
      });

      try {
        // Validate input using the tool's Zod schema centrally
        const validatedInput = tool.schema.parse(block.input) as unknown;
        // Execute tool with validated input wrapped in withTimeout
        const output = (await withTimeout(
          tool.execute(validatedInput),
          this.toolTimeoutMs,
          `Tool "${block.name}" execution timed out after ${this.toolTimeoutMs}ms`,
        )) as unknown;
        const latencyMs = Date.now() - t0;

        this.logger.log({
          event: 'tool_result',
          runId,
          agentName,
          turn: turnNumber,
          toolName: block.name,
          latencyMs,
          success: true,
        });

        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          name: block.name,
          content: JSON.stringify(output),
        });
      } catch (error: unknown) {
        const latencyMs = Date.now() - t0;
        const errorType = this.classifyError(error);

        this.logger.log({
          event: 'tool_result',
          runId,
          agentName,
          turn: turnNumber,
          toolName: block.name,
          latencyMs,
          success: false,
          errorType,
        });

        if (error instanceof ZodError) {
          this.logger.warn(`Tool "${block.name}" validation failed: ${error.message}`, {
            input: block.input,
            errors: error.issues,
          });
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            name: block.name,
            content: JSON.stringify({ error: `Validation failed: ${error.message}` }),
          });
          continue;
        }

        // Systemic / unexpected error: Log and bubble up to halt execution
        this.logger.error(
          `Critical error executing tool "${block.name}": ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          { toolName: block.name, input: block.input },
        );
        throw error;
      }
    }
    return results;
  }

  private classifyError(error: any): string {
    if (error instanceof ZodError) {
      return 'validation';
    }
    const msg = error?.message || String(error);
    const code = error?.code || '';
    const msgLower = msg.toLowerCase();
    
    if (
      msgLower.includes('timeout') ||
      msgLower.includes('etimedout') ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT'
    ) {
      return 'timeout';
    }
    
    if (
      msgLower.includes('network') ||
      msgLower.includes('econnrefused') ||
      msgLower.includes('fetch') ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED'
    ) {
      return 'network';
    }
    
    return 'execution';
  }
}
