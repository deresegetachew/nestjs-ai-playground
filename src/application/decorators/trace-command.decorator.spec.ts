import { TraceCommand } from './trace-command.decorator';
import { getTraceId, setTraceDelegate, TraceContextDelegate } from '../utils/trace-context';

describe('TraceCommand Decorator', () => {
  let mockTraceStore: string | undefined = undefined;
  let mockAgentNameStore: string | undefined = undefined;

  const testDelegate: TraceContextDelegate = {
    run<T>(traceId: string, callback: () => T, agentName?: string): T {
      const prevTrace = mockTraceStore;
      const prevAgent = mockAgentNameStore;
      mockTraceStore = traceId;
      mockAgentNameStore = agentName;
      try {
        return callback();
      } finally {
        mockTraceStore = prevTrace;
        mockAgentNameStore = prevAgent;
      }
    },
    getTraceId(): string | undefined {
      return mockTraceStore;
    },
    getAgentName(): string | undefined {
      return mockAgentNameStore;
    },
    setAgentName(agentName: string): void {
      mockAgentNameStore = agentName;
    },
  };

  beforeAll(() => {
    setTraceDelegate(testDelegate);
  });

  it('should run execute method inside trace context using traceId from command', async () => {
    @TraceCommand()
    class TestHandler {
      async execute(cmd: any) {
        return getTraceId();
      }
    }

    const handler = new TestHandler();
    const result = await handler.execute({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736' });

    expect(result).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should generate a default traceId if command has no traceId', async () => {
    @TraceCommand()
    class TestHandler {
      async execute(cmd: any) {
        return getTraceId();
      }
    }

    const handler = new TestHandler();
    const result = await handler.execute({});

    expect(result).toBeDefined();
    expect(result).toMatch(/^[0-9a-f]{32}$/);
    expect(result).toHaveLength(32); // W3C compliant 32-character hex string
  });

  it('should preserve trace context inside Async Generator iterations', async () => {
    @TraceCommand()
    class TestStreamHandler {
      execute(cmd: any) {
        async function* stream() {
          yield getTraceId();
        }
        return stream();
      }
    }

    const handler = new TestStreamHandler();
    const stream = (await handler.execute({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736' })) as AsyncIterable<string | undefined>;

    let emittedTraceId: string | undefined;
    for await (const val of stream) {
      emittedTraceId = val;
    }

    expect(emittedTraceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});
