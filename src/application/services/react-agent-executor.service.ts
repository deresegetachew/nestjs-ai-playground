import { Inject, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AIClient } from '../ports/ai-client.port';
import { Tool } from '../ports/tool.interface';
import { AgentMessage, AgentStreamChunk } from '../ports/agent-types';
import { ToolExecutor } from './tool-executor.service';
import { BaseAgentExecutor } from './base-agent-executor';
import { validateOutputText } from '../guardrails/output.guardrail';

@Injectable()
export class ReActAgentExecutor extends BaseAgentExecutor {
  private readonly logger = new Logger(ReActAgentExecutor.name);

  constructor(
    @Inject(AIClient)
    private readonly aiClient: AIClient,
    toolExecutor: ToolExecutor,
  ) {
    super(toolExecutor);
  }

  run(
    systemPrompt: string,
    tools: Tool[],
    messages: AgentMessage[],
    maxTurns = 10,
  ): Observable<AgentStreamChunk> {
    // We return a cold RxJS Observable.
    // The void async IIFE pattern inside is the standard way to run an async execution loop
    // inside an Observable constructor.
    return new Observable<AgentStreamChunk>((subscriber) => {
      // The active flag tracks if the subscriber is still listening.
      // If the subscriber unsubscribes, the teardown function sets active = false,
      // which safely halts the async execution loop and stops side-effects.
      let active = true;

      void (async () => {
        try {
          const localMessages = [...messages];
          const executionState = this.createExecutionState();
          let turns = 0;

          while (active) {
            if (turns >= maxTurns) {
              subscriber.error(
                new Error(
                  `Agent exceeded maximum number of turns (${maxTurns}).`,
                ),
              );
              return;
            }
            turns++;
            this.logger.debug(`Starting turn ${turns}...`);

            // 1. Get next turn from LLM via port using split chunks$ and turn$ streams
            const { chunks$, turn$ } = this.aiClient.createMessage({
              maxTokens: 1024,
              system: systemPrompt,
              tools: this.mapToolsToDefinition(tools),
              messages: [...localMessages],
            });

            // Stream chunks to the subscriber in real-time.
            // NOTE: The error callback is intentionally a no-op. When the strategy
            // encounters an error it calls subject.error(err) AND re-throws inside
            // the async IIFE so that turn$ also rejects. Without an error handler
            // here, RxJS treats the Subject error as unhandled and crashes the
            // process via reportUnhandledError — even though the outer try/catch
            // already handles it via the turn$ rejection path.
            const sub = chunks$.subscribe({
              next: (chunk) => {
                if (active) {
                   subscriber.next({ type: 'text', text: chunk });
                }
              },
              error: () => {
                // Intentional no-op: error is propagated through turn$ rejection
                // and handled by the outer try/catch block below.
              },
            });

            // Await the final parsed AgentTurn promise.
            // ORDERING CONTRACT: The strategy implementation guarantees that it calls
            // subject.complete() (ending chunks$) BEFORE resolving turn$. This means
            // by the time we reach this line, the subscription above has already
            // received all chunks and the Subject has closed. sub.unsubscribe() is
            // therefore a safe no-op — kept here as a defensive cleanup signal.
            const turn = await turn$;
            sub.unsubscribe();

            if (!active) return;
            if (!turn) {
              subscriber.error(
                new Error(
                  'LLM stream completed without returning an AgentTurn.',
                ),
              );
              return;
            }

            // Append assistant's turn
            localMessages.push({ role: 'assistant', content: turn.content });

            if (turn.isEndTurn) {
              try {
                validateOutputText(turn.reply);
              } catch (err) {
                subscriber.error(err);
                return;
              }
              subscriber.next({ type: 'turn_completed', isEnd: true });
              subscriber.complete();
              return;
            }

             if (turn.isToolUse) {
              subscriber.next({ type: 'turn_completed', isEnd: false });

              this.logger.debug(
                `Calling tools: ${turn.toolUses.map((u) => u.name).join(', ')}`,
              );

              // NOTE: repetition loop detection currently only checks adjacent turns (limited to immediate back-to-back repetitions)
              const loopCheck = this.processToolCalls(
                executionState,
                turn.toolUses,
              );

              if (loopCheck.shouldTerminate) {
                const termMsg = `Agent execution stopped: the agent became stuck in a repetitive loop calling tool "${loopCheck.offendingTool}". Last thought: ${turn.reply || 'none'}`;
                this.logger.error(`Loop termination triggered: ${termMsg}`);
                subscriber.next({ type: 'error', text: termMsg });
                subscriber.complete();
                return;
              }

              // Emit calling tool info to subscriber
              for (const toolUse of turn.toolUses) {
                subscriber.next({
                  type: 'tool_use',
                  name: toolUse.name,
                  input: toolUse.input,
                });
              }

              // 2. Loop through tool calls requested in this turn using composition
              const results = await this.toolExecutor.execute(turn, tools);

              if (loopCheck.shouldWarn) {
                const warnMsg = `System Warning: You have called the tool "${loopCheck.offendingTool}" multiple times with similar arguments without making progress. Try a different approach or provide a best-effort answer.`;
                results.push({
                  type: 'text',
                  text: warnMsg,
                });
                subscriber.next({ type: 'warning', text: warnMsg });
              }

              // Emit observations to subscriber
              for (const res of results) {
                if (res.type === 'tool_result') {
                  this.logger.debug(
                    `Tool result for "${res.name}" (truncated): ${res.content.substring(0, 200)}`,
                  );
                  subscriber.next({
                    type: 'observation',
                    content: res.content,
                  });
                }
              }

              // 3. Append observation list and loop back
              localMessages.push({ role: 'user', content: results });
            }
          }
        } catch (err: any) {
          this.logger.error(`Error during agent execution: ${err.message || err}`, err.stack);
          if (active) {
            subscriber.error(err);
          }
        }
      })();

      return () => {
        active = false;
      };
    });
  }
}
