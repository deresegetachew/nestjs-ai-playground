/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import { safeInvoke } from './api-retry';
import {
  InvalidRequestException,
  AuthenticationException,
  ServerException,
  RateLimitException,
} from '../../../../application/exceptions/ai-client.exception';

describe('safeInvoke', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    } as unknown as Logger;
  });

  it('should return successfully if no error occurs', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const res = await safeInvoke(fn, logger);
    expect(res).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should fail immediately on 400 (Bad request)', async () => {
    const error = { status: 400, message: 'Invalid params' };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(safeInvoke(fn, logger)).rejects.toThrow(
      InvalidRequestException,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should fail immediately on 401 (Auth error)', async () => {
    const error = { status: 401, message: 'Bad API key' };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(safeInvoke(fn, logger)).rejects.toThrow(
      AuthenticationException,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429 with backoff and then succeed', async () => {
    jest.useFakeTimers();
    const error = { status: 429, message: 'Rate limited' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('resolved-after-retry');

    const promise = safeInvoke(fn, logger);

    // Fast-forward time for the 1000ms delay
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe('resolved-after-retry');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Rate limited (429)'),
    );
    jest.useRealTimers();
  });

  it('should log all 3 retry attempts before throwing RateLimitException on status 429', async () => {
    jest.useFakeTimers();
    const error = { status: 429, message: 'Rate limited' };
    const fn = jest.fn().mockRejectedValue(error);

    const promise = expect(safeInvoke(fn, logger)).rejects.toThrow(
      RateLimitException,
    );

    // 1st retry:
    await jest.advanceTimersByTimeAsync(1000);
    // 2nd retry:
    await jest.advanceTimersByTimeAsync(2000);
    // 3rd retry:
    await jest.advanceTimersByTimeAsync(4000);

    await promise;

    expect(fn).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('(Attempt 1/3)'),
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('(Attempt 2/3)'),
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('(Attempt 3/3)'),
    );

    jest.useRealTimers();
  });

  it('should retry on 529 with a fixed 5s delay and then succeed', async () => {
    jest.useFakeTimers();
    const error = { status: 529, message: 'API overloaded' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('resolved-after-overload');

    const promise = safeInvoke(fn, logger);

    // Fast-forward time for the 5000ms delay
    await jest.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe('resolved-after-overload');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('API overloaded (529)'),
    );
    jest.useRealTimers();
  });

  it('should retry on 500 server error and then fail after max retries', async () => {
    jest.useFakeTimers();
    const error = { status: 500, message: 'Internal Server Error' };
    const fn = jest.fn().mockRejectedValue(error);

    const promise = expect(safeInvoke(fn, logger)).rejects.toThrow(
      ServerException,
    );

    // Fast-forward for the 4 attempts:
    // Attempt 1: fails, delays 1000ms
    // Attempt 2: fails, delays 2000ms
    // Attempt 3: fails, delays 4000ms
    // Attempt 4: fails, throws
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);

    await promise;
    expect(fn).toHaveBeenCalledTimes(4);
    jest.useRealTimers();
  });
});
