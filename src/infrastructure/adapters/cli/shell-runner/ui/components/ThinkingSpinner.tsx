import React from 'react';
import type * as InkModule from 'ink';

export interface ThinkingSpinnerProps {
  ink: typeof InkModule;
  Spinner: React.ComponentType<{
    type?: string;
  }>;
}

export const ThinkingSpinner: React.FC<ThinkingSpinnerProps> = ({ ink, Spinner }) => {
  const { Box, Text } = ink;
  return (
    <Box marginBottom={1} paddingLeft={1}>
      <Text color="magenta">
        <Spinner type="dots" />
      </Text>
      <Text color="gray" italic>
        {' '}
        thinking ...
      </Text>
    </Box>
  );
};
