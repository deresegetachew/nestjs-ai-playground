import React from 'react';
import type * as InkModule from 'ink';
import pc from 'picocolors';

export interface WelcomeBannerProps {
  ink: typeof InkModule;
  agents: { name: string; desc: string }[];
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ ink, agents }) => {
  const { Box, Text } = ink;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      padding={1}
      marginBottom={1}
    >
      <Text bold>
        🧠 {pc.bold('nestjs-ai-playground')} <Text dimColor>v0.0.1</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan" bold>
          Active Agents:
        </Text>
        {agents.map((agent) => (
          <Box key={agent.name} flexDirection="column" marginLeft={2}>
            <Text bold>🤖 {agent.name}</Text>
            <Text color="gray"> └─ {agent.desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan" bold>
          Commands:
        </Text>
        <Text>
          {' '}
          • Type <Text color="yellow">agent</Text> to open an interactive select
          menu
        </Text>
        <Text>
          {' '}
          • Type <Text color="yellow">agent &lt;agent-name&gt;</Text> to select
          directly
        </Text>
        <Text>
          {' '}
          • Type <Text color="yellow">clear</Text> to clear the console screen
        </Text>
        <Text>
          {' '}
          • Type <Text color="red">exit</Text> or <Text color="red">quit</Text> to
          close the shell
        </Text>
      </Box>
    </Box>
  );
};
