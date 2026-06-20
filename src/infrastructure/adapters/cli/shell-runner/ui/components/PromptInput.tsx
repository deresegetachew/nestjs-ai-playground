import React from 'react';
import type * as InkModule from 'ink';
import pc from 'picocolors';
import { MultilineTextInput } from './MultilineTextInput';

export interface PromptInputProps {
  ink: typeof InkModule;
  mode: string;
  activeAgentName?: string;
  input: string;
  setInput: (val: string) => void;
  onSubmit: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  ink,
  mode,
  activeAgentName,
  input,
  setInput,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
}) => {
  const { Box, Text } = ink;
  const isAgent = mode === 'AGENT_SESSION';
  const borderColor = isAgent ? 'green' : 'magenta';
  const contextBadge = activeAgentName ? `🤖 ${activeAgentName}` : '🧠 ai-playground';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        flexDirection="row"
        justifyContent="flex-end"
        width="100%"
        marginBottom={0}
        paddingX={1}
      >
        <Text color="gray" dimColor>
          {contextBadge}
        </Text>
      </Box>
      <MultilineTextInput
        ink={ink}
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        borderColor={borderColor}
        placeholder={placeholder}
        disabled={disabled}
      />
      {!disabled && (
        <Box marginLeft={1} marginTop={0}>
          <Text color="gray" dimColor>
            press {pc.bold('Enter')} to send ∙ {pc.bold('Alt+Enter')} for newline
          </Text>
        </Box>
      )}
    </Box>
  );
};
