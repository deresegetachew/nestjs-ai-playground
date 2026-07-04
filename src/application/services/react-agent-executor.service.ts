import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { AgentMessage, AgentStreamChunk, LlmModel } from '../ports/agent-types';
import { ToolExecutor } from './tool-executor.service';
import { BaseAgentExecutor } from './base-agent-executor';
import { AgentExecutionTimedOutException, AgentMaxTurnsExceededException } from '../exceptions/agent-execution.exception';

@Injectable()
export class ReActAgentExecutor extends BaseAgentExecutor {
  protected readonly logger = new Logger(ReActAgentExecutor.name);

  constructor(
    toolExecutor: ToolExecutor,
    @Inject(AIClient)
    aiClient: AIClient,
    @Optional()
    configService?: ConfigService,
  ) {
    super(toolExecutor, aiClient, configService);
  }

  async *run(
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
    maxTurns = 10,
    traceId?: string,
    agentName?: string,
    model: LlmModel = LlmModel.GeminiFlash,
    temperature?: number,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    const runId = traceId ?? crypto.randomUUID();
    const  ctx = this.createRunContext(
      runId,
      systemPrompt,
      tools,
      messages,
      maxTurns,
      model,
      agentName ?? ReActAgentExecutor.name,
      temperature,
    );

    this.logger.log({
      event: 'run_start',
      runId: ctx.runId,
      agentName: ctx.agentName,
      model: ctx.model,
      toolCount: tools.length,
      messageCount: messages.length,
    });

    try {
      while (this.withinExecutionThresholdsOrThrow(ctx, this.timeoutMs)) {
        ctx.incrementTurns();

        this.logger.log({ event: 'turn_start', runId: ctx.runId, turn: ctx.turns });

        await this.checkAndTrimContext(ctx);

        const llmResponse = yield* this.executeLlmTurn(ctx);

        if (llmResponse.isEndTurn) {
          yield* this.handleEndTurn(ctx, llmResponse);
          return;
        }

        if (llmResponse.isToolUse) {
          const { shouldTerminate } = yield* this.executeAndObserveTools(ctx, llmResponse);
          if (shouldTerminate) return;
        }
      }
    } catch (err: any) {
      const status =
        err instanceof AgentExecutionTimedOutException ? 'timeout' :
        err instanceof AgentMaxTurnsExceededException ? 'max_turns_exceeded' :
        'failed';

      this.logger.log({
        event: 'run_complete',
        runId: ctx.runId,
        agentName: ctx.agentName,
        model: ctx.model,
        totalTurns: ctx.turns,
        totalLatencyMs: Date.now() - ctx.runStart,
        status,
        totalInputTokens: ctx.totalInputTokens,
        totalOutputTokens: ctx.totalOutputTokens,
        totalThoughtTurns: ctx.totalThoughtTurns,
      });
      this.logger.error(
        `Error during agent execution: ${err.message ?? err}`,
        err.stack,
        err,
      );
      throw err;
    }
  }
}
