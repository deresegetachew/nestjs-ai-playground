/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

let stateIndex = 0;
let mockStates: unknown[] = [];
let mockSetStates: Array<(val: unknown) => void> = [];

export const reactMockControl = {
  reset(): void {
    stateIndex = 0;
    mockStates = [];
    mockSetStates = [];
  },
  resetIndex(): void {
    stateIndex = 0;
  },
  setCursorIndex(val: number): void {
    mockStates[0] = val;
  },
};

jest.mock('react', () => {
  const original = jest.requireActual('react');
  return {
    ...original,
    useState: <T>(
      init: T | (() => T),
    ): [T, (val: T | ((prev: T) => T)) => void] => {
      const currentIndex = stateIndex;
      stateIndex++;
      if (mockStates[currentIndex] === undefined) {
        mockStates[currentIndex] =
          typeof init === 'function' ? (init as () => T)() : init;
      }
      if (mockSetStates[currentIndex] === undefined) {
        mockSetStates[currentIndex] = (newVal: unknown) => {
          if (typeof newVal === 'function') {
            mockStates[currentIndex] = (newVal as (prev: unknown) => unknown)(
              mockStates[currentIndex],
            );
          } else {
            mockStates[currentIndex] = newVal;
          }
        };
      }
      return [mockStates[currentIndex] as T, mockSetStates[currentIndex]];
    },
    useRef: <T>(initialValue: T): { current: T } => {
      const currentIndex = stateIndex;
      stateIndex++;
      if (mockStates[currentIndex] === undefined) {
        mockStates[currentIndex] = { current: initialValue };
      }
      return mockStates[currentIndex] as { current: T };
    },
    useEffect: (fn: () => void | (() => void)): void => {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        cleanup();
      }
    },
  };
});

// Mock ink globally
jest.mock('ink', () => {
  return {
    render: jest.fn().mockReturnValue({
      waitUntilExit: jest.fn().mockResolvedValue(undefined),
    }),
    Box: ({ children }: { children: unknown }) => children,
    Text: ({ children }: { children: unknown }) => children,
    useApp: jest.fn().mockReturnValue({
      exit: jest.fn(),
    }),
    useInput: jest.fn(),
  };
});

// Mock ink inputs and spinner globally
jest.mock('ink-text-input', () => {
  return {
    __esModule: true,
    default: (): null => null,
  };
});

jest.mock('ink-select-input', () => {
  return {
    __esModule: true,
    default: (): null => null,
  };
});

jest.mock('ink-spinner', () => {
  return {
    __esModule: true,
    default: (): null => null,
  };
});

// Global OpenTelemetry Mocks for Jest Isolation
jest.mock('@opentelemetry/sdk-node', () => {
  return {
    NodeSDK: jest.fn().mockImplementation(() => {
      return {
        start: jest.fn(),
        shutdown: jest.fn(),
      };
    }),
  };
});

jest.mock('@opentelemetry/api-logs', () => {
  const original = jest.requireActual('@opentelemetry/api-logs');
  return {
    ...original,
    logs: {
      setGlobalLoggerProvider: jest.fn(),
      getLogger: jest.fn().mockImplementation(() => {
        return {
          emit: jest.fn(),
        };
      }),
    },
  };
});

jest.mock('@opentelemetry/sdk-logs', () => {
  return {
    SimpleLogRecordProcessor: jest.fn(),
    LoggerProvider: jest.fn().mockImplementation(() => {
      return {
        addLogRecordProcessor: jest.fn(),
      };
    }),
  };
});

jest.mock('@opentelemetry/exporter-logs-otlp-http', () => {
  return {
    OTLPLogExporter: jest.fn(),
  };
});

jest.mock('@opentelemetry/auto-instrumentations-node', () => {
  return {
    getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
  };
});
