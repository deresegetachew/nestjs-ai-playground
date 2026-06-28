import React from 'react';
import type * as InkModule from 'ink';
import {
  RateLimitException,
  AuthenticationException,
  APIOverloadedException,
  ServerException,
  InvalidRequestException,
} from '../../../../../../application/exceptions/ai-client.exception';

export interface LogStep {
  type: 'thought' | 'calling_tool' | 'observation' | 'warning';
  text: string;
}

export interface LogEntry {
  type: 'user' | 'bot' | 'system' | 'error';
  agentName?: string;
  text: string;
  steps?: LogStep[];
  finalAnswer?: string;
  isCollapsed?: boolean;
  rawTurnText?: string;
}

export function getFriendlyErrorMessage(err: unknown): string {
  if (err instanceof RateLimitException) {
    const msg = err.message;
    const delayMatch = msg.match(/retry in ([\d.]+)s/i);
    const seconds = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) : 7;
    return `AI model API rate limit exceeded. Please try again in ${seconds} seconds.`;
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
  // ZodError: duck-type via the `issues` array to avoid importing zod in the UI layer.
  // Its .message is a raw JSON issues array — not user-friendly.
  if (
    err instanceof Error &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  ) {
    return 'Invalid input: please check your message and try again.';
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
      const steps = log.steps || [];
      const hasContent = steps.length > 0 || log.text.trim().length > 0 || log.finalAnswer;

      if (!hasContent) {
        return null;
      }

      const isCollapsed = log.isCollapsed ?? false;

      if (isCollapsed) {
        return (
          <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
            <Box flexDirection="row">
              <Text color="cyan">▶ </Text>
              <Text color="gray" bold>Model Thinking</Text>
              <Text color="gray" dimColor> ({steps.length} steps, press Ctrl+T to expand)</Text>
            </Box>
            {log.finalAnswer ? (
              <Box marginTop={0}>
                <Text color="white">{log.finalAnswer}</Text>
              </Box>
            ) : null}
          </Box>
        );
      }

      return (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text color="cyan">▼ </Text>
              <Text color="gray" bold>Model Thinking</Text>
              <Text color="gray" dimColor> (press Ctrl+T to collapse)</Text>
            </Box>
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="cyan"
              paddingX={1}
              marginTop={0}
              marginBottom={0}
            >
              {steps.map((step, idx) => {
                let color = 'white';
                let prefix = '';
                if (step.type === 'thought') {
                  color = 'cyan';
                  prefix = '[Thought]: ';
                } else if (step.type === 'calling_tool') {
                  color = 'yellow';
                  prefix = '[Calling Tool]: ';
                } else if (step.type === 'observation') {
                  color = 'gray';
                  prefix = '[Observation]: ';
                } else if (step.type === 'warning') {
                  color = 'red';
                  prefix = '[Warning]: ';
                }
                return (
                  <Box key={idx} flexDirection="row">
                    <Text color={color} bold>{prefix}</Text>
                    <Text color="white">{step.text}</Text>
                  </Box>
                );
              })}
              {log.text.trim().length > 0 && (
                <Box flexDirection="row">
                  <Text color="cyan" bold>[Thought]: </Text>
                  <Text color="white">{log.text}</Text>
                </Box>
              )}
              {steps.length === 0 && log.text.trim().length === 0 && (
                <Text color="gray" italic>Direct response (0 steps taken)</Text>
              )}
            </Box>
          </Box>
          {log.finalAnswer ? (
            <Box marginTop={0}>
              <Text color="white">{log.finalAnswer}</Text>
            </Box>
          ) : null}
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
