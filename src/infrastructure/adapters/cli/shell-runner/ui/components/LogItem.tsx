import React from 'react';
import type * as InkModule from 'ink';
import {
  RateLimitException,
  AuthenticationException,
  APIOverloadedException,
  ServerException,
  InvalidRequestException,
} from '../../../../../../application/exceptions/ai-client.exception';

export interface LogEntry {
  type: 'user' | 'bot' | 'system' | 'error';
  agentName?: string;
  text: string;
}

export function getFriendlyErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    if (err instanceof RateLimitException) {
      const msg = err.message;
      const delayMatch = msg.match(/retry in ([\d.]+)s/i);
      const seconds = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) : 7;
      return `Rate limit exceeded. Please try again in ${seconds} seconds.`;
    }
    if (err instanceof AuthenticationException) {
      return 'Authentication failed. Please check your API keys.';
    }
    if (err instanceof APIOverloadedException) {
      return 'AI service is currently overloaded. Please try again shortly.';
    }
    if (err instanceof ServerException) {
      return 'The AI service returned a server error. Please try again later.';
    }
    if (err instanceof InvalidRequestException) {
      return `Invalid request: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export interface LogItemProps {
  ink: typeof InkModule;
  log: LogEntry;
}

export const LogItem: React.FC<LogItemProps> = ({ ink, log }) => {
  const { Box, Text } = ink;
  switch (log.type) {
    case 'user':
      return (
        <Box marginBottom={1} alignSelf="flex-start" paddingX={1}>
          <Text inverse color="magenta"> {log.text} </Text>
        </Box>
      );

    case 'bot': {
      if (!log.text) {
        return null;
      }
      return (
        <Box marginBottom={1} paddingLeft={1}>
          <Text color="white">{log.text}</Text>
        </Box>
      );
    }

    case 'system':
      return (
        <Box marginBottom={1}>
          <Text color="blue" bold>
            ℹ️{' '}
          </Text>
          <Text color="blue" italic>
            {log.text}
          </Text>
        </Box>
      );

    case 'error':
      return (
        <Box
          marginBottom={1}
          borderStyle="double"
          borderColor="red"
          padding={1}
          flexDirection="column"
        >
          <Text color="red" bold>
            ❌ Error Details:
          </Text>
          <Text color="red">{log.text}</Text>
        </Box>
      );

    default:
      return null;
  }
};
