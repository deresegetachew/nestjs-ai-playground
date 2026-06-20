import React, { useState } from 'react';
import type * as InkModule from 'ink';
import { AgentRegistry, RegistryCommand } from '../agent.registry';
import { ShellRouter } from '../shell.router';
import { Observable } from 'rxjs';
import { WelcomeBanner } from './components/WelcomeBanner';
import { LogItem, LogEntry, getFriendlyErrorMessage } from './components/LogItem';
import { ThinkingSpinner } from './components/ThinkingSpinner';
import { PromptInput } from './components/PromptInput';

export interface ShellUIProps {
  ink: typeof InkModule;
  TextInput: React.ComponentType<{
    value?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
  }>;
  SelectInput: React.ComponentType<{
    items: Array<{ label: string; value: string }>;
    onSelect?: (item: { label: string; value: string }) => void;
  }>;
  Spinner: React.ComponentType<{
    type?: string;
  }>;
  agentRegistry: AgentRegistry;
  shellRouter: ShellRouter;
  onGetAgentStream: (
    agentName: string,
    message: string,
  ) => Promise<Observable<string>>;
}

// ==========================================
// MAIN COMPONENT: ShellUI
// ==========================================
export const ShellUI: React.FC<ShellUIProps> = ({
  ink,
  TextInput,
  SelectInput,
  Spinner,
  agentRegistry,
  shellRouter,
  onGetAgentStream,
}) => {
  const { Box, Text, useApp } = ink;
  const { exit } = useApp();
  const [mode, setMode] = useState<
    'PARENT_SHELL' | 'AGENT_SELECT' | 'AGENT_SESSION'
  >('PARENT_SHELL');
  const [activeAgent, setActiveAgent] = useState<RegistryCommand | null>(null);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const welcomeAgents = agentRegistry.getAgents().map((agent) => ({
    name: agent.name().replace(/_/g, '-'),
    desc: agent.description() || 'No description available.',
  }));

  const handleAgentSelect = (item: { value: string }) => {
    const targetAgent = agentRegistry.findAgent(item.value);
    if (targetAgent) {
      setActiveAgent(targetAgent);
      setMode('AGENT_SESSION');
      setLogs((prev) => [
        ...prev,
        {
          type: 'system',
          text: `Entered agent session: ${item.value}. Type :exit to return to parent shell.`,
        },
      ]);
    } else {
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          text: `Agent "${item.value}" not found.`,
        },
      ]);
      setMode('PARENT_SHELL');
    }
  };

  const handleSubmit = async (value: string) => {
    setInput('');
    const action = shellRouter.resolve(value, mode === 'AGENT_SESSION');

    switch (action.type) {
      case 'EMPTY':
        break;

      case 'EXIT':
        if (mode === 'AGENT_SESSION') {
          setActiveAgent(null);
          setMode('PARENT_SHELL');
        } else {
          setLogs((prev) => [...prev, { type: 'system', text: 'Goodbye!' }]);
          exit();
        }
        break;

      case 'CLEAR':
        setLogs([]);
        break;

      case 'AGENT_MENU':
        setMode('AGENT_SELECT');
        break;

      case 'AGENT_SELECT': {
        const agentName = action.payload || '';
        handleAgentSelect({ value: agentName });
        break;
      }

      case 'CHAT': {
        if (!activeAgent) break;
        const message = action.payload || '';
        const agentDisplayName = activeAgent.name().replace(/_/g, '-');

        setLogs((prev) => [...prev, { type: 'user', text: message }]);
        setIsThinking(true);
        setIsWaiting(true);

        const currentLogsLength = logs.length + 1;

        setLogs((prev) => [
          ...prev,
          { type: 'bot', agentName: agentDisplayName, text: '' },
        ]);

        try {
          const stream$ = await onGetAgentStream(activeAgent.name(), message);
          setIsThinking(false);

          await new Promise<void>((resolve, reject) => {
            stream$.subscribe({
              next: (chunk) => {
                setLogs((prev) => {
                  const updated = [...prev];
                  const targetLog = updated[currentLogsLength];
                  if (targetLog) {
                    targetLog.text += chunk;
                  }
                  return updated;
                });
              },
              error: (err) => {
                setIsWaiting(false);
                reject(err);
              },
              complete: () => {
                setIsWaiting(false);
                resolve();
              },
            });
          });
        } catch (err: unknown) {
          setIsThinking(false);
          setIsWaiting(false);
          const errMsg = getFriendlyErrorMessage(err);
          setLogs((prev) => {
            const updated = [...prev];
            const targetLog = updated[currentLogsLength];
            if (targetLog) {
              targetLog.text = errMsg;
              targetLog.type = 'error';
            }
            return updated;
          });
        }
        break;
      }

      case 'EXECUTE_AGENT_COMMAND': {
        const commandName = action.payload || '';
        const targetAgent = agentRegistry.findAgent(commandName);

        if (!targetAgent) {
          setLogs((prev) => [
            ...prev,
            { type: 'error', text: `unknown command "${commandName}"` },
          ]);
          break;
        }

        const message = (action.args || []).join(' ');
        const agentDisplayName = targetAgent.name().replace(/_/g, '-');

        setLogs((prev) => [
          ...prev,
          { type: 'user', text: `${commandName} ${message}`.trim() },
        ]);
        setIsThinking(true);
        setIsWaiting(true);

        const currentLogsLength = logs.length + 1;
        setLogs((prev) => [
          ...prev,
          { type: 'bot', agentName: agentDisplayName, text: '' },
        ]);

        try {
          const stream$ = await onGetAgentStream(targetAgent.name(), message);
          setIsThinking(false);

          await new Promise<void>((resolve, reject) => {
            stream$.subscribe({
              next: (chunk) => {
                setLogs((prev) => {
                  const updated = [...prev];
                  const targetLog = updated[currentLogsLength];
                  if (targetLog) {
                    targetLog.text += chunk;
                  }
                  return updated;
                });
              },
              error: (err) => {
                setIsWaiting(false);
                reject(err);
              },
              complete: () => {
                setIsWaiting(false);
                resolve();
              },
            });
          });
        } catch (err: unknown) {
          setIsThinking(false);
          setIsWaiting(false);
          const errMsg = getFriendlyErrorMessage(err);
          setLogs((prev) => {
            const updated = [...prev];
            const targetLog = updated[currentLogsLength];
            if (targetLog) {
              targetLog.text = errMsg;
              targetLog.type = 'error';
            }
            return updated;
          });
        }
        break;
      }
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* 1. Welcome Card Banner */}
      {logs.length === 0 && (
        <WelcomeBanner ink={ink} agents={welcomeAgents} />
      )}

      {/* 2. Chat Log Entries */}
      {logs.map((log, index) => (
        <LogItem key={index} ink={ink} log={log} />
      ))}

      {/* 3. Thinking Spinner */}
      {isThinking && (
        <ThinkingSpinner
          ink={ink}
          Spinner={Spinner}
        />
      )}

      {/* 4. Autocomplete Selection Menu */}
      {mode === 'AGENT_SELECT' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            Select an agent to run (Use Arrow Keys & Enter):
          </Text>
          <SelectInput
            items={agentRegistry.getAgents().map((agent) => {
              const name = agent.name().replace(/_/g, '-');
              return {
                label: `${name} (${agent.description() || 'No description'})`,
                value: name,
              };
            })}
            onSelect={handleAgentSelect}
          />
        </Box>
      )}

      {/* 5. Command line Prompt */}
      {mode !== 'AGENT_SELECT' && (
        <PromptInput
          ink={ink}
          mode={mode}
          activeAgentName={
            activeAgent ? activeAgent.name().replace(/_/g, '-') : undefined
          }
          input={input}
          setInput={setInput}
          onSubmit={(val) => {
            void handleSubmit(val);
          }}
          disabled={isWaiting}
          placeholder={
            isThinking
              ? 'Agent is thinking...'
              : isWaiting
                ? 'Agent is typing...'
                : 'Type a message...'
          }
        />
      )}
    </Box>
  );
};
