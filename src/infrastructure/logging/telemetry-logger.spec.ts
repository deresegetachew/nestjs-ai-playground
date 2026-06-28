import { TelemetryLogger } from './telemetry-logger';
import { runWithTrace } from '../../application/utils/trace-context';
import '../tracing/trace-storage';
import * as fs from 'node:fs';
import { logs } from '@opentelemetry/api-logs';

jest.mock('node:fs', () => {
  const original = jest.requireActual('node:fs');
  return {
    ...original,
    mkdirSync: jest.fn().mockImplementation(() => ''),
    appendFileSync: jest.fn(),
  };
});

describe('TelemetryLogger', () => {
  let logger: TelemetryLogger;
  let stdoutWriteSpy: jest.SpyInstance;
  let otelEmitSpy: jest.Mock;

  beforeEach(() => {
    otelEmitSpy = jest.fn();
    (logs.getLogger as jest.Mock).mockReturnValue({
      emit: otelEmitSpy,
    });

    logger = new TelemetryLogger('TestContext');
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  it('should log output in JSON format locally and emit OTel logs', () => {
    logger.log('Hello world');

    // Check local console output
    expect(stdoutWriteSpy).toHaveBeenCalled();
    const loggedString = stdoutWriteSpy.mock.calls[0][0];
    const loggedObj = JSON.parse(loggedString.trim());

    expect(loggedObj.level).toBe('INFO');
    expect(loggedObj.message).toBe('Hello world');
    expect(loggedObj.traceId).toBeNull();
    expect(loggedObj.context).toBe('TestContext');

    // Check OTel log emission
    expect(otelEmitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Hello world'),
        severityText: 'INFO',
        attributes: expect.objectContaining({
          traceId: 'SYSTEM',
          context: 'TestContext',
        }),
      }),
    );
  });

  it('should automatically inject traceId when running inside trace context', () => {
    runWithTrace('4bf92f3577b34da6a3ce929d0e0e4736', () => {
      logger.log('Trace test');
    });

    expect(stdoutWriteSpy).toHaveBeenCalled();
    const loggedString = stdoutWriteSpy.mock.calls[0][0];
    const loggedObj = JSON.parse(loggedString.trim());
    expect(loggedObj.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

    expect(otelEmitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Trace test'),
        attributes: expect.objectContaining({
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        }),
      }),
    );
  });

  it('should capture metadata objects passed in optional parameters', () => {
    logger.log('Log with metadata', { key: 'value', nested: { foo: 'bar' } });

    expect(stdoutWriteSpy).toHaveBeenCalled();
    const loggedString = stdoutWriteSpy.mock.calls[0][0];
    const loggedObj = JSON.parse(loggedString.trim());
    expect(loggedObj.key).toBe('value');
    expect(loggedObj.nested).toEqual({ foo: 'bar' });

    expect(otelEmitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Log with metadata'),
        attributes: expect.objectContaining({
          key: 'value',
          nested: JSON.stringify({ foo: 'bar' }),
        }),
      }),
    );
  });

  it('should handle alternative log levels like ERROR, WARN, DEBUG', () => {
    logger.error('An error occurred');
    const loggedError = JSON.parse(stdoutWriteSpy.mock.calls[0][0].trim());
    expect(loggedError.level).toBe('ERROR');
    expect(otelEmitSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: expect.stringContaining('An error occurred'),
        severityText: 'ERROR',
      }),
    );

    logger.warn('A warning');
    const loggedWarn = JSON.parse(stdoutWriteSpy.mock.calls[1][0].trim());
    expect(loggedWarn.level).toBe('WARN');
    expect(otelEmitSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.stringContaining('A warning'),
        severityText: 'WARN',
      }),
    );

    logger.debug('Debug msg');
    const loggedDebug = JSON.parse(stdoutWriteSpy.mock.calls[2][0].trim());
    expect(loggedDebug.level).toBe('DEBUG');
    expect(otelEmitSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        body: expect.stringContaining('Debug msg'),
        severityText: 'DEBUG',
      }),
    );
  });

  it('should work when wrapped in NestJS Logger', () => {
    const { Logger: NestLogger } = require('@nestjs/common');
    NestLogger.overrideLogger(logger);
    const nestLogger = new NestLogger('TestWrapper');
    nestLogger.debug('Debug via wrapper', { someMetadata: 'value' });

    expect(stdoutWriteSpy).toHaveBeenCalled();
    const loggedString = stdoutWriteSpy.mock.calls[0][0];
    const loggedObj = JSON.parse(loggedString.trim());
    expect(loggedObj.level).toBe('DEBUG');
    expect(loggedObj.context).toBe('TestWrapper');
    expect(loggedObj.message).toBe('Debug via wrapper');
    expect(loggedObj.someMetadata).toBe('value');

    expect(otelEmitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Debug via wrapper'),
        severityText: 'DEBUG',
        attributes: expect.objectContaining({
          context: 'TestWrapper',
          someMetadata: 'value',
        }),
      }),
    );
  });

  it('should redirect logs to app.log file when process.env.CLI_SHELL is true', () => {
    const originalShellVal = process.env.CLI_SHELL;
    process.env.CLI_SHELL = 'true';

    try {
      logger.log('Shell log message');

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(fs.appendFileSync).toHaveBeenCalled();

      const loggedString = (fs.appendFileSync as jest.Mock).mock.calls[0][1] as string;
      const loggedObj = JSON.parse(loggedString.trim());
      expect(loggedObj.message).toBe('Shell log message');

      expect(otelEmitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Shell log message'),
        }),
      );
    } finally {
      process.env.CLI_SHELL = originalShellVal;
    }
  });
});
