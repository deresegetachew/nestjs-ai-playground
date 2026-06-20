import React from 'react';
import * as ink from 'ink';
import { WelcomeBanner } from './WelcomeBanner';
import { ThinkingSpinner } from './ThinkingSpinner';
import { PromptInput } from './PromptInput';
import { LogItem, getFriendlyErrorMessage } from './LogItem';
import {
  RateLimitException,
  AuthenticationException,
  APIOverloadedException,
  ServerException,
  InvalidRequestException,
} from '../../../../../../application/exceptions/ai-client.exception';

describe('Shared UI Components', () => {
  const mockInk = ink;

  describe('WelcomeBanner', () => {
    it('should render active agents and command instructions', () => {
      const agents = [{ name: 'agent-1', desc: 'desc-1' }];
      const element = WelcomeBanner({ ink: mockInk, agents });
      expect(element).toBeDefined();
    });
  });

  describe('ThinkingSpinner', () => {
    it('should render dots spinner inline', () => {
      const mockSpinner = ({ type }: any) => null;
      const element = ThinkingSpinner({ ink: mockInk, Spinner: mockSpinner });
      expect(element).toBeDefined();
    });
  });

  describe('PromptInput', () => {
    it('should render in standard mode', () => {
      const onChange = jest.fn();
      const onSubmit = jest.fn();
      const element = PromptInput({
        ink: mockInk,
        mode: 'PARENT_SHELL',
        input: 'test',
        setInput: onChange,
        onSubmit: onSubmit,
      });
      expect(element).toBeDefined();
    });

    it('should render in agent mode', () => {
      const onChange = jest.fn();
      const onSubmit = jest.fn();
      const element = PromptInput({
        ink: mockInk,
        mode: 'AGENT_SESSION',
        activeAgentName: 'my-agent',
        input: 'test',
        setInput: onChange,
        onSubmit: onSubmit,
        disabled: true,
      });
      expect(element).toBeDefined();
    });
  });

  describe('LogItem & Errors', () => {
    it('should render user log items', () => {
      const element = LogItem({
        ink: mockInk,
        log: { type: 'user', text: 'hello' },
      });
      expect(element).toBeDefined();
    });

    it('should render bot log items', () => {
      const element1 = LogItem({
        ink: mockInk,
        log: { type: 'bot', text: '' },
      });
      expect(element1).toBeNull();

      const element2 = LogItem({
        ink: mockInk,
        log: { type: 'bot', text: 'response' },
      });
      expect(element2).toBeDefined();
    });

    it('should render system log items', () => {
      const element = LogItem({
        ink: mockInk,
        log: { type: 'system', text: 'system notice' },
      });
      expect(element).toBeDefined();
    });

    it('should render error log items', () => {
      const element = LogItem({
        ink: mockInk,
        log: { type: 'error', text: 'something broke' },
      });
      expect(element).toBeDefined();
    });

    it('should map exception classes to friendly messages', () => {
      const rateLimitErr = new RateLimitException('Rate limit: retry in 10s');
      expect(getFriendlyErrorMessage(rateLimitErr)).toContain('try again in 10 seconds');

      const genericRateLimitErr = new RateLimitException('Rate limit hit');
      expect(getFriendlyErrorMessage(genericRateLimitErr)).toContain('7 seconds');

      const authErr = new AuthenticationException('auth failed');
      expect(getFriendlyErrorMessage(authErr)).toContain('API keys');

      const overloadedErr = new APIOverloadedException('overloaded');
      expect(getFriendlyErrorMessage(overloadedErr)).toContain('overloaded');

      const serverErr = new ServerException('server crash');
      expect(getFriendlyErrorMessage(serverErr)).toContain('server error');

      const requestErr = new InvalidRequestException('bad request params');
      expect(getFriendlyErrorMessage(requestErr)).toContain('Invalid request');

      const regularErr = new Error('ordinary error');
      expect(getFriendlyErrorMessage(regularErr)).toBe('ordinary error');

      expect(getFriendlyErrorMessage('string error')).toBe('string error');
    });
  });
});
