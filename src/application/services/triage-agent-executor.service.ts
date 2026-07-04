import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { AgentMessage, AgentStreamChunk, AgentTurn, LlmModel } from '../ports/agent-types';
import { RoutingDecision } from '../ports/agent-config.interface';
import { ToolExecutor } from './tool-executor.service';
import { BaseAgentExecutor } from './base-agent-executor';
import { AgentExecutionTimedOutException, AgentMaxTurnsExceededException } from '../exceptions/agent-execution.exception';

@Injectable()
export class TriageAgentExecutor extends BaseAgentExecutor {
  protected readonly logger = new Logger(TriageAgentExecutor.name);

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
    _maxTurns?: number,
    traceId?: string,
    _agentName?: string,
    model: LlmModel = LlmModel.GeminiFlashLite,
    temperature = 0.0,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    const runId = traceId ?? crypto.randomUUID();
    const ctx = this.createRunContext(
      runId,
      systemPrompt,
      tools,
      messages,
      1,
      model,
      TriageAgentExecutor.name,
      temperature,
      { toolName: tools[0].name },
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
      this.withinExecutionThresholdsOrThrow(ctx, this.timeoutMs);
      ctx.incrementTurns();

      this.logger.log({ event: 'turn_start', runId: ctx.runId, turn: ctx.turns });

      await this.checkAndTrimContext(ctx);

      // Suppress message_added — triage's routing call is internal state,
      // not a conversation turn. The specialist must receive a clean history.
      let llmResponse!: AgentTurn;
      const turnGen = this.executeLlmTurn(ctx);
      while (true) {
        const next = await turnGen.next();
        if (next.done) { llmResponse = next.value as AgentTurn; break; }
        if (next.value.type !== 'message_added') yield next.value;
      }

      if (llmResponse.isEndTurn) {
        this.logger.error({
          event: 'triage_forced_tool_ignored',
          runId: ctx.runId,
          agentName: ctx.agentName,
          message: `LLM returned end_turn instead of calling forced tool '${ctx.toolChoice?.toolName}' — routing failed`,
        });
        return;
      }

      if (llmResponse.isToolUse) {
        const toolUse = llmResponse.toolUses.find(t => t.name === ctx.toolChoice!.toolName);
        const { specialists, reason } = toolUse!.input as RoutingDecision;

        this.logger.log({
          event: 'run_complete',
          runId: ctx.runId,
          agentName: ctx.agentName,
          model: ctx.model,
          totalTurns: ctx.turns,
          totalLatencyMs: Date.now() - ctx.runStart,
          status: 'success',
          totalInputTokens: ctx.totalInputTokens,
          totalOutputTokens: ctx.totalOutputTokens,
          totalThoughtTurns: ctx.totalThoughtTurns,
        });

        yield { type: 'routing_decision', specialists, reason };
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
