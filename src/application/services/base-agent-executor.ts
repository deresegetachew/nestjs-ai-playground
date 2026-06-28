import { z } from 'zod';
import { Logger, Inject } from '@nestjs/common';
import { Tool } from '../ports/tool.interface';
import {
  AgentMessage,
  ToolUseBlock,
  AgentStreamChunk,
  AgentTurn,
} from '../ports/agent-types';
import { ToolExecutor } from './tool-executor.service';
import { AIClient } from '../ports/ai-client.port';
import { sanitiseToolSchema } from '../utils/schema.utils';
import {
  AgentExecutionTimedOutException,
  AgentMaxTurnsExceededException,
  AgentLoopDetectedException,
  LlmStreamIncompleteException,
} from '../exceptions/agent-execution.exception';
import { validateOutputText } from '../guardrails/output.guardrail';
import { AgentRunContext, AgentExecutionState, ToolCallHistoryEntry } from './agent-executor.types';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/config.schema';
import { loadConfig } from '../../config/load-config';


// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export abstract class BaseAgentExecutor {
  /**
   * Each concrete executor declares its own NestJS Logger so log lines carry
   * the correct class name. Declared abstract here so the compiler enforces it.
   */
  protected abstract readonly logger: Logger;

  protected contextWindowLimit = 1048576;
  protected timeoutMs = 60000;

  constructor(
    protected readonly toolExecutor: ToolExecutor,
    @Inject(AIClient)
    protected readonly aiClient: AIClient,
    protected readonly configService?: ConfigService<AppConfig>,
  ) {
    try {
      if (this.configService) {
        const timeoutMs = this.configService.get('ai.timeoutMs', { infer: true });
        if (timeoutMs !== undefined) this.timeoutMs = timeoutMs;

        const contextWindowLimit = this.configService.get('ai.contextWindowLimit', { infer: true });
        if (contextWindowLimit !== undefined) this.contextWindowLimit = contextWindowLimit;
      } else {
        const config = loadConfig();
        this.timeoutMs = config.ai.timeoutMs;
        this.contextWindowLimit = config.ai.contextWindowLimit;
      }
    } catch {
      // Safe fallback — defaults set at field declaration level.
    }
  }

  abstract run(
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
    maxTurns?: number,
    traceId?: string,
    agentName?: string,
  ): AsyncIterable<AgentStreamChunk>;

  // ---------------------------------------------------------------------------
  // Factory helpers
  // ---------------------------------------------------------------------------

  protected createRunContext(
    runId: string,
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
    maxTurns: number,
    model: string,
    agentName: string,
  ): AgentRunContext {
    return {
      runId,
      agentName,
      runStart: Date.now(),
      model,
      maxTurns,
      systemPrompt,
      tools,
      localMessages: [...messages],
      turns: 0,
      executionState: this.createExecutionState(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThoughtTurns: 0,
    };
  }

  protected createExecutionState(): AgentExecutionState {
    return {
      history: [],
      warningInjected: false,
      turnsSinceWarning: 0,
    };
  }

  /**
   * Map standard domain Tool structures to the format expected by AI Clients.
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

  // ---------------------------------------------------------------------------
  // Execution guards
  // ---------------------------------------------------------------------------

  /**
   * Throws when the run has exceeded its configured timeout or maximum turn
   * count. Call once at the top of each loop iteration, before incrementing
   * `ctx.turns`.
   */
  protected withinExecutionThresholdsOrThrow(
    ctx: AgentRunContext,
    timeoutMs: number,
  ): boolean {
    const elapsedMs = Date.now() - ctx.runStart;

    if (elapsedMs > timeoutMs) {
      throw new AgentExecutionTimedOutException(timeoutMs, ctx.runId);
    }

    if (ctx.turns >= ctx.maxTurns) {
      throw new AgentMaxTurnsExceededException(ctx.maxTurns, ctx.runId);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  /**
   * Checks whether the current conversation is approaching the model's context
   * window limit. When it is, it summarises the older portion of the
   * conversation and replaces it with a compact summary card so the agent can
   * keep running without hitting a token-limit error.
   */
  protected async checkAndTrimContext(ctx: AgentRunContext): Promise<void> {
    try {
      const tokenCount = await this.aiClient.countTokens(
        ctx.localMessages,
        ctx.model,
      );

      if (tokenCount <= 0.75 * this.contextWindowLimit) return;
      if (ctx.localMessages.length <= 5) return;

      const messagesToSummarize = ctx.localMessages.slice(
        0,
        ctx.localMessages.length - 5,
      );
      const last5Messages = ctx.localMessages.slice(
        ctx.localMessages.length - 5,
      );

      const textToSummarize = messagesToSummarize
        .map((m) => {
          const contentStr =
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content);
          return `${m.role.toUpperCase()}: ${contentStr}`;
        })
        .join('\n\n');

      const { turnPromise } = this.aiClient.createMessage({
        maxTokens: 512,
        system:
          'Summarise the key facts and decisions from this conversation in 200 words.',
        tools: [],
        messages: [{ role: 'user', content: textToSummarize }],
        model: ctx.model,
      });

      const summaryTurn = await turnPromise;
      const summaryText = summaryTurn.reply || '';

      this.logger.log({
        event: 'conversation_summarized',
        runId: ctx.runId,
        agentName: ctx.agentName,
        model: ctx.model,
        turn: ctx.turns,
        originalTokenCount: tokenCount,
        summaryLength: summaryText.length,
        triggerLimit: Math.floor(0.75 * this.contextWindowLimit),
      });

      // Replace history prefix with a compact summary card.
      ctx.localMessages.splice(
        0,
        ctx.localMessages.length,
        { role: 'user', content: `Previous conversation summary: ${summaryText}` },
        ...last5Messages,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to count tokens or summarize conversation: ${err.message ?? err}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  /**
   * Handles a `tool_use` turn: checks for repetitive loops, emits tool call
   * events, executes the tools, emits observations, and appends results to the
   * conversation. Returns `{ shouldTerminate: true }` when a loop is detected
   * that cannot be recovered from.
   */
  protected async *executeAndObserveTools(
    ctx: AgentRunContext,
    turn: AgentTurn,
  ): AsyncGenerator<AgentStreamChunk, { shouldTerminate: boolean }, unknown> {
    yield { type: 'turn_completed', isEnd: false };

    const loopCheck = this.processToolCalls(ctx.executionState, turn.toolUses);

    if (loopCheck.shouldWarn) {
      this.logger.log({
        event: 'loop_warning',
        runId: ctx.runId,
        agentName: ctx.agentName,
        turn: ctx.turns,
        offendingTool: loopCheck.offendingTool,
      });
    }

    if (loopCheck.shouldTerminate) {
      const loopError = new AgentLoopDetectedException(
        loopCheck.offendingTool!,
        turn.reply,
        ctx.runId,
      );

      this.logger.error(`Loop termination triggered: ${loopError.message}`);
      this.logger.log({
        event: 'run_complete',
        runId: ctx.runId,
        agentName: ctx.agentName,
        model: ctx.model,
        totalTurns: ctx.turns,
        totalLatencyMs: Date.now() - ctx.runStart,
        status: 'loop_terminated',
        totalInputTokens: ctx.totalInputTokens,
        totalOutputTokens: ctx.totalOutputTokens,
        totalThoughtTurns: ctx.totalThoughtTurns,
      });

      // Yield the error event so the stream consumer receives the message
      // before the generator completes — then signal early termination.
      yield { type: 'error', text: loopError.message };
      return { shouldTerminate: true };
    }

    // Emit tool-call intent before executing so the UI can show a spinner.
    for (const toolUse of turn.toolUses) {
      yield { type: 'tool_use', name: toolUse.name, input: toolUse.input };
    }

    const results = await this.toolExecutor.execute(
      turn,
      ctx.tools,
      ctx.runId,
      ctx.turns,
      ctx.agentName,
    );

    // Inject a warning message into the tool results so the LLM is nudged to
    // try a different approach.
    if (loopCheck.shouldWarn) {
      const warnMsg =
        `System Warning: You have called the tool "${loopCheck.offendingTool}" ` +
        `multiple times with similar arguments without making progress. ` +
        `Try a different approach or provide a best-effort answer.`;
      results.push({ type: 'text', text: warnMsg });
      yield { type: 'warning', text: warnMsg };
    }

    // Emit one observation event per tool result so the UI can render them.
    for (const res of results) {
      if (res.type === 'tool_result') {
        yield { type: 'observation', content: res.content };
      }
    }

    // Append the full tool-result block to the conversation and signal the
    // host so it can persist the update before the next LLM call.
    const userResultsMsg: AgentMessage = { role: 'user', content: results };
    ctx.localMessages.push(userResultsMsg);
    yield { type: 'message_added', message: userResultsMsg };

    return { shouldTerminate: false };
  }

  /**
   * Handles the `end_turn` stop reason: validates the final reply through the
   * output guardrail, logs run completion, and signals the host that streaming
   * is finished.
   */
  protected async *handleEndTurn(
    ctx: AgentRunContext,
    turn: AgentTurn,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    try {
      validateOutputText(turn.reply);
    } catch (err: any) {
      this.logger.error(
        `Output guardrail validation failed: ${err.message ?? err}`,
        err.stack,
      );
      throw err;
    }

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

    yield { type: 'turn_completed', isEnd: true };
  }

  /**
   * Sends the current conversation to the LLM, streams back raw text chunks,
   * and waits for the fully-parsed AgentTurn. The generator returns the turn
   * as its return value so the `run` loop can dispatch on it.
   */
  protected async *executeLlmTurn(
    ctx: AgentRunContext,
  ): AsyncGenerator<AgentStreamChunk, AgentTurn, unknown> {
    const t0 = Date.now();

    const { chunks, turnPromise } = this.aiClient.createMessage({
      maxTokens: 1024,
      system: ctx.systemPrompt,
      tools: this.mapToolsToDefinition(ctx.tools),
      messages: [...ctx.localMessages],
      model: ctx.model,
    });

    // Prevent unhandled promise rejection if chunks throw before turnPromise is awaited.
    // The rejection will still be thrown correctly when we await turnPromise below.
    turnPromise.catch(() => {});

    // Stream classified chunks to the caller, counting thought turns.
    let hadThoughtInTurn = false;
    for await (const chunk of this.streamClassifiedChunks(chunks)) {
      if (chunk.type === 'thought') hadThoughtInTurn = true;
      yield chunk;
    }
    if (hadThoughtInTurn) ctx.totalThoughtTurns++;

    const turn = await turnPromise;

    if (!turn) {
      throw new LlmStreamIncompleteException(ctx.runId);
    }

    const latencyMs = Date.now() - t0;
    const inputTokens = turn.usage?.inputTokens ?? 0;
    const outputTokens = turn.usage?.outputTokens ?? 0;

    ctx.totalInputTokens += inputTokens;
    ctx.totalOutputTokens += outputTokens;

    this.logger.log({
      event: 'llm_response',
      runId: ctx.runId,
      agentName: ctx.agentName,
      model: ctx.model,
      turn: ctx.turns,
      stopReason: turn.stopReason,
      latencyMs,
      inputTokens,
      outputTokens,
    });

    if (turn.usage) {
      yield { type: 'token_usage', inputTokens, outputTokens };
    }

    // Append the assistant message immediately so the next handler or the next
    // iteration of the loop sees an up-to-date conversation history.
    const assistantMsg: AgentMessage = { role: 'assistant', content: turn.content };
    ctx.localMessages.push(assistantMsg);
    yield { type: 'message_added', message: assistantMsg };

    return turn;
  }

  // ---------------------------------------------------------------------------
  // Loop-detection internals
  // ---------------------------------------------------------------------------

  protected processToolCalls(
    state: AgentExecutionState,
    toolUses: ToolUseBlock[],
  ): { shouldWarn: boolean; shouldTerminate: boolean; offendingTool?: string } {
    let repetitiveDetected = false;
    let offendingTool = '';

    for (const block of toolUses) {
      const hash = this.generateArgsHash(block.input);
      state.history.push({ tool: block.name, argsHash: hash });

      // Cap sliding window to avoid unbounded memory growth.
      if (state.history.length > 12) {
        state.history.shift();
      }

      const len = state.history.length;

      // Check for repeating subsequences of cycle length k.
      for (let k = 1; k <= Math.floor(len / 2); k++) {
        let matches = true;
        for (let i = 0; i < k; i++) {
          const current = state.history[len - 1 - i];
          const previous = state.history[len - 1 - k - i];
          if (
            current.tool !== previous.tool ||
            current.argsHash !== previous.argsHash
          ) {
            matches = false;
            break;
          }
        }
        if (matches) {
          repetitiveDetected = true;
          offendingTool = block.name;
          break;
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

  protected generateArgsHash(args: unknown): string {
    if (!args) return '';
    try {
      const sortObject = (obj: unknown): unknown => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sortObject);
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

  private async *streamClassifiedChunks(
    rawChunks: AsyncIterable<string>,
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    let accumulatedText = '';
    let hasDetermined = false;
    let isThoughtStream = false;
    let printedLength = 0;

    for await (const chunk of rawChunks) {
      accumulatedText += chunk;

      if (!hasDetermined) {
        const clean = accumulatedText.trimStart().toLowerCase();
        const target = 'thought:';
        
        let couldBeThought = false;
        if (clean.length < target.length) {
          couldBeThought = target.startsWith(clean);
        } else {
          couldBeThought = clean.startsWith(target);
        }

        if (couldBeThought) {
          if (clean.startsWith(target)) {
            isThoughtStream = true;
            hasDetermined = true;
            
            // Yield the portion after "Thought:"
            const idx = accumulatedText.toLowerCase().indexOf('thought:');
            const remaining = accumulatedText.slice(idx + target.length).trimStart();
            if (remaining) {
              yield { type: 'thought', text: remaining };
            }
            printedLength = accumulatedText.length;
          }
          // Otherwise, wait for more chunks to decide
        } else {
          // Direct response: stream as 'text'
          isThoughtStream = false;
          hasDetermined = true;
          
          // Check if it starts with "final answer:" or "answer:"
          const isFinalAnswerMarker = clean.startsWith('final answer:');
          const isAnswerMarker = clean.startsWith('answer:');
          let remaining = accumulatedText;
          if (isFinalAnswerMarker) {
            const idx = accumulatedText.toLowerCase().indexOf('final answer:');
            remaining = accumulatedText.slice(idx + 'final answer:'.length).trimStart();
          } else if (isAnswerMarker) {
            const idx = accumulatedText.toLowerCase().indexOf('answer:');
            remaining = accumulatedText.slice(idx + 'answer:'.length).trimStart();
          }
          
          yield { type: 'text', text: remaining };
          printedLength = accumulatedText.length;
        }
      } else {
        const unprinted = accumulatedText.slice(printedLength);
        
        if (isThoughtStream) {
          const match = accumulatedText.match(/(final answer|answer)\s*:\s*/i);
          if (match && match.index !== undefined) {
            const matchIndex = match.index;
            const matchLength = match[0].length;
            
            if (matchIndex >= printedLength) {
              // Yield the thought part before the match
              const before = accumulatedText.slice(printedLength, matchIndex);
              if (before) {
                yield { type: 'thought', text: before };
              }
              // Transition to final answer
              isThoughtStream = false;
              const after = accumulatedText.slice(matchIndex + matchLength).trimStart();
              if (after) {
                yield { type: 'text', text: after };
              }
              printedLength = accumulatedText.length;
            } else {
              yield { type: 'text', text: unprinted };
              printedLength = accumulatedText.length;
            }
          } else {
            // Prevent printing partial "final answer:" split across chunks
            const lowerUnprinted = unprinted.toLowerCase();
            const targetMarker = 'final answer:';
            let partialMatchLength = 0;
            for (let i = 1; i < targetMarker.length; i++) {
              if (lowerUnprinted.endsWith(targetMarker.slice(0, i))) {
                partialMatchLength = i;
              }
            }
            
            if (partialMatchLength > 0) {
              const toPrint = unprinted.slice(0, -partialMatchLength);
              if (toPrint) {
                yield { type: 'thought', text: toPrint };
              }
              printedLength += toPrint.length;
            } else {
              yield { type: 'thought', text: unprinted };
              printedLength = accumulatedText.length;
            }
          }
        } else {
          yield { type: 'text', text: unprinted };
          printedLength = accumulatedText.length;
        }
      }
    }

    // Flush any unprinted characters
    if (!hasDetermined) {
      yield { type: 'text', text: accumulatedText };
    } else {
      const remaining = accumulatedText.slice(printedLength);
      if (remaining) {
        yield {
          type: isThoughtStream ? 'thought' : 'text',
          text: remaining,
        };
      }
    }
  }
}
