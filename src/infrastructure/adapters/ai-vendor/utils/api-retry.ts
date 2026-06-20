import { Logger } from '@nestjs/common';
import {
  InvalidRequestException,
  AuthenticationException,
  RateLimitException,
  APIOverloadedException,
  ServerException,
} from '../../../../application/exceptions/ai-client.exception';

interface ErrorDetails {
  status: number | null;
  message: string;
  code: string;
}

type Decision =
  | { type: 'throw'; error: Error }
  | { type: 'retry'; delay: number; logMessage: string }
  | { type: 'propagate' };

type HandlerRule = (
  details: ErrorDetails,
  attempt: number,
  maxRetries: number,
) => Decision;

/**
 * Extracts status, message, and error code from raw error object.
 */
function parseErrorDetails(err: unknown): ErrorDetails {
  let status: number | null = null;
  let message = '';
  let code = '';

  if (err && typeof err === 'object') {
    const errorObj = err as Record<string, unknown>;

    // Safely cast response object if present
    const responseObj =
      errorObj.response && typeof errorObj.response === 'object'
        ? (errorObj.response as Record<string, unknown>)
        : null;

    // Attempt to extract status from various typical fields
    const possibleStatuses = [
      errorObj.status,
      errorObj.statusCode,
      responseObj?.status,
      responseObj?.statusCode,
    ];
    const foundStatus = possibleStatuses.find((s) => typeof s === 'number');
    status = foundStatus !== undefined ? foundStatus : null;

    if (typeof errorObj.message === 'string') {
      message = errorObj.message;
    }
    if (typeof errorObj.code === 'string') {
      code = errorObj.code;
    }
  }

  // Fallback: Parse status code from error message if status is not explicitly set
  if (!status && message) {
    const mappings = [
      { keywords: ['429', 'RESOURCE_EXHAUSTED'], status: 429 },
      { keywords: ['529', 'overloaded'], status: 529 },
      { keywords: ['400', 'INVALID_ARGUMENT'], status: 400 },
      { keywords: ['401', 'UNAUTHENTICATED'], status: 401 },
      { keywords: ['403', 'PERMISSION_DENIED'], status: 403 },
      { keywords: ['500', 'INTERNAL'], status: 500 },
      { keywords: ['503', 'UNAVAILABLE'], status: 503 },
    ];

    const match = mappings.find((m) =>
      m.keywords.some((kw) => message.includes(kw)),
    );
    if (match) {
      status = match.status;
    }
  }

  return { status, message, code };
}

// 1. Immediate Failures Rule (400, 401, 403)
const immediateFailuresRule: HandlerRule = (details) => {
  if (details.status === 400) {
    return {
      type: 'throw',
      error: new InvalidRequestException(details.message),
    };
  }
  if (details.status === 401 || details.status === 403) {
    return {
      type: 'throw',
      error: new AuthenticationException(
        `Authentication/Permission failed (${details.status}). Check your API keys.`,
        details.status,
      ),
    };
  }
  return { type: 'propagate' };
};

// 2. Rate Limit Rule (429)
const rateLimitRule: HandlerRule = (details, attempt, maxRetries) => {
  if (details.status === 429) {
    if (attempt >= maxRetries) {
      return {
        type: 'throw',
        error: new RateLimitException(details.message),
      };
    }
    const delay = Math.pow(2, attempt) * 1000;
    return {
      type: 'retry',
      delay,
      logMessage: `Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`,
    };
  }
  return { type: 'propagate' };
};

// 3. API Overloaded Rule (529)
const apiOverloadedRule: HandlerRule = (details, attempt, maxRetries) => {
  if (details.status === 529) {
    if (attempt >= maxRetries) {
      return {
        type: 'throw',
        error: new APIOverloadedException(details.message),
      };
    }
    const delay = 5000;
    return {
      type: 'retry',
      delay,
      logMessage: `API overloaded (529). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`,
    };
  }
  return { type: 'propagate' };
};

// 4. Server Error Rule (>= 500)
const serverErrorRule: HandlerRule = (details, attempt, maxRetries) => {
  if (details.status && details.status >= 500) {
    if (attempt >= maxRetries) {
      return {
        type: 'throw',
        error: new ServerException(details.message, details.status),
      };
    }
    const delay = Math.pow(2, attempt) * 1000;
    return {
      type: 'retry',
      delay,
      logMessage: `Server error (${details.status}). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`,
    };
  }
  return { type: 'propagate' };
};

// 5. Transient Network Error Rule
const transientNetworkRule: HandlerRule = (details, attempt, maxRetries) => {
  const isTransient =
    details.code === 'ECONNRESET' ||
    details.code === 'ETIMEDOUT' ||
    details.message.includes('fetch') ||
    details.message.includes('network');

  if (isTransient) {
    if (attempt >= maxRetries) {
      return { type: 'propagate' };
    }
    const delay = Math.pow(2, attempt) * 1000;
    return {
      type: 'retry',
      delay,
      logMessage: `Transient connection error (${details.code || 'network'}). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`,
    };
  }
  return { type: 'propagate' };
};

const RULES: HandlerRule[] = [
  immediateFailuresRule,
  rateLimitRule,
  apiOverloadedRule,
  serverErrorRule,
  transientNetworkRule,
];

/**
 * Executes a promise-returning API function with status-based retries and exponential backoff.
 * Uses Chain of Responsibility pattern for decision handling.
 */
export async function safeInvoke<T>(
  fn: () => Promise<T>,
  logger: Logger,
): Promise<T> {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      const details = parseErrorDetails(err);

      // Evaluate rules sequentially
      let decision: Decision = { type: 'propagate' };
      for (const rule of RULES) {
        const result = rule(details, attempt, MAX_RETRIES);
        if (result.type !== 'propagate') {
          decision = result;
          break;
        }
      }

      if (decision.type === 'throw') {
        throw decision.error;
      }

      if (decision.type === 'retry') {
        logger.warn(decision.logMessage);
        await new Promise((r) => setTimeout(r, decision.delay));
        attempt++;
        continue;
      }

      // If no rules handled it, throw the original error
      throw err;
    }
  }
}
