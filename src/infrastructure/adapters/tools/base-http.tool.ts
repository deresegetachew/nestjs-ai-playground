import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { safeInvoke } from '../ai-vendor/utils/api-retry';

export abstract class BaseHttpTool {
  protected readonly httpClient: AxiosInstance;
  protected readonly httpLogger: Logger;

  constructor(timeout = 5000) {
    this.httpLogger = new Logger(this.constructor.name);
    this.httpClient = axios.create({
      timeout,
    });
  }

  /**
   * Performs an operation (e.g. an HTTP request) with automatic retries and
   * exponential backoff using the api-retry safeInvoke pattern.
   */
  protected async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return safeInvoke(fn, this.httpLogger);
  }
}
