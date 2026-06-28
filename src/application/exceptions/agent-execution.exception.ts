/**
 * Base class for all exceptions that originate from the agent execution
 * pipeline (orchestration logic, turn management, loop detection).
 *
 * These are application-layer exceptions: they represent policy violations and
 * execution failures that the application services detect and surface.  They
 * are intentionally separate from AIClientException (which covers vendor I/O
 * failures) and from any domain-level invariant errors.
 */
export class AgentExecutionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains correct prototype chain so `instanceof` works after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a run exceeds its wall-clock time budget.
 *
 * The timeout policy (how long is "too long") is an application concern —
 * it is configured at the service level and has no meaning inside the domain.
 */
export class AgentExecutionTimedOutException extends AgentExecutionException {
  constructor(
    public readonly timeoutMs: number,
    public readonly runId: string,
  ) {
    super(`Agent execution timed out after ${timeoutMs}ms. runId=${runId}`);
  }
}

/**
 * Thrown when a run exceeds the maximum number of reasoning turns.
 *
 * `maxTurns` is a runtime guard against runaway agents, not a domain rule.
 */
export class AgentMaxTurnsExceededException extends AgentExecutionException {
  constructor(
    public readonly maxTurns: number,
    public readonly runId: string,
  ) {
    super(
      `Agent exceeded maximum number of turns (${maxTurns}). runId=${runId}`,
    );
  }
}

/**
 * Thrown when the loop-detection algorithm determines that the agent is stuck
 * calling the same tool repeatedly without making progress.
 *
 * Carries the name of the offending tool and the agent's last thought so
 * callers (e.g. a CLI runner or a streaming handler) can surface a meaningful
 * message to the user.
 */
export class AgentLoopDetectedException extends AgentExecutionException {
  constructor(
    public readonly offendingTool: string,
    public readonly lastThought: string,
    public readonly runId: string,
  ) {
    super(
      `Agent is stuck in a repetitive loop calling tool "${offendingTool}". ` +
        `Last thought: ${lastThought || 'none'}. runId=${runId}`,
    );
  }
}

/**
 * Thrown when the LLM stream completes but does not return a parseable
 * AgentTurn — e.g. due to a malformed vendor response or premature stream
 * termination.
 *
 * This sits at the application/infrastructure boundary: the application layer
 * detects that the port contract was violated and wraps it in a typed error.
 */
export class LlmStreamIncompleteException extends AgentExecutionException {
  constructor(public readonly runId: string) {
    super(
      `LLM stream completed without returning an AgentTurn. runId=${runId}`,
    );
  }
}
