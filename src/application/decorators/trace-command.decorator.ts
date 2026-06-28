
import { runWithTrace } from '../utils/trace-context';
import * as crypto from 'node:crypto';

export function TraceCommand(agentName?: string) {
  return function (target: Function) {
    const originalExecute = target.prototype.execute;
    if (typeof originalExecute === 'function') {
      target.prototype.execute = async function (cmd: any, ...args: any[]) {
        // Generate a trace ID using standard runtime crypto if not provided
        const uuid = crypto.randomUUID().replace(/-/g, '');
        const traceId = cmd?.traceId || uuid;

        return runWithTrace(traceId, async () => {
          const result = await originalExecute.apply(this, [cmd, ...args]);

          if (result && typeof result[Symbol.asyncIterator] === 'function') {
            const iterator = result[Symbol.asyncIterator]();
            return {
              [Symbol.asyncIterator]() {
                return {
                  async next(...nextArgs: any[]) {
                    return runWithTrace(traceId, () => iterator.next(...nextArgs), agentName);
                  },
                  async return(value: any) {
                    if (typeof iterator.return === 'function') {
                      return runWithTrace(traceId, () => iterator.return(value), agentName);
                    }
                    return { done: true, value };
                  },
                  async throw(err: any) {
                    if (typeof iterator.throw === 'function') {
                      return runWithTrace(traceId, () => iterator.throw(err), agentName);
                    }
                    throw err;
                  },
                };
              },
            };
          }

          return result;
        }, agentName);
      };
    }
  };
}
