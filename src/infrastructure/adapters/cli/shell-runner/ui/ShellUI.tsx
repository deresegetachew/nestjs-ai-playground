import React, { useState } from 'react';
import type * as InkModule from 'ink';
import { AgentRegistry, RegistryCommand } from '../agent.registry';
import { ShellRouter } from '../shell.router';
import { WelcomeBanner } from './components/WelcomeBanner';
import { LogItem, LogEntry, getFriendlyErrorMessage } from './components/LogItem';
import { ThinkingSpinner } from './components/ThinkingSpinner';
import { PromptInput } from './components/PromptInput';
import { AgentStreamChunk, AgentMessage, TextBlock } from '../../../../../application/ports/agent-types';

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
    conversationId: string,
  ) => Promise<AsyncIterable<AgentStreamChunk>>;
  onListConversations?: (
    agentName: string,
  ) => Promise<Array<{ id: string; updatedAt: string }>>;
  onLoadConversation?: (
    conversationId: string,
  ) => Promise<AgentMessage[]>;
  /** Called when the user exits an agent session — lets the infrastructure
   *  layer clear any stateful session data (e.g., conversation history). */
  onExitAgentSession?: (agentName: string) => void;
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Extracts the clean final answer from the LLM's raw streamed text.
 * ReAct models often emit: "Thought: ...\nFinal Answer: <answer>"
 * We strip the Thought preamble and the "Final Answer:" label so only
 * the plain answer text is rendered outside the thinking box.
 */
function extractFinalAnswer(raw: string): string {
  // Try to find a "Final Answer:" marker (case-insensitive)
  const match = raw.match(/final answer\s*:\s*/i);
  if (match && match.index !== undefined) {
    return raw.slice(match.index + match[0].length).trim();
  }
  // No marker found — return the full text as-is
  return raw.trim();
}

/**
 * Maps AgentMessage[] database entities to the visual LogEntry[] format.
 */
function mapHistoryToLogs(messages: AgentMessage[], agentDisplayName: string): LogEntry[] {
  const logs: LogEntry[] = [];
  let activeBotLog: LogEntry | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        logs.push({ type: 'user', text: msg.content });
        // Start a new bot entry for the subsequent assistant response
        activeBotLog = {
          type: 'bot',
          agentName: agentDisplayName,
          text: '',
          steps: [],
          isCollapsed: true,
        };
        logs.push(activeBotLog);
      } else if (Array.isArray(msg.content)) {
        // These are tool results. Append them to the active bot entry
        if (activeBotLog) {
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              activeBotLog.steps = activeBotLog.steps || [];
              activeBotLog.steps.push({
                type: 'observation',
                text: block.content,
              });
            }
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (activeBotLog) {
        const blocks = Array.isArray(msg.content)
          ? msg.content
          : [{ type: 'text', text: msg.content } as TextBlock];
        for (const block of blocks) {
          if (block.type === 'text') {
            const hasFinalAnswer = /final answer\s*:\s*/i.test(block.text);
            if (hasFinalAnswer) {
              activeBotLog.finalAnswer = extractFinalAnswer(block.text);
              const match = block.text.match(/final answer\s*:\s*/i);
              const thoughtPart = block.text.slice(0, match!.index).trim();
              if (thoughtPart) {
                activeBotLog.steps = activeBotLog.steps || [];
                activeBotLog.steps.push({
                  type: 'thought',
                  text: thoughtPart,
                });
              }
            } else {
              activeBotLog.steps = activeBotLog.steps || [];
              activeBotLog.steps.push({
                type: 'thought',
                text: block.text,
              });
            }
          } else if (block.type === 'tool_use') {
            activeBotLog.steps = activeBotLog.steps || [];
            activeBotLog.steps.push({
              type: 'calling_tool',
              text: `${block.name} with ${JSON.stringify(block.input)}`,
            });
          }
        }
      }
    }
  }

  // Filter out any empty bot logs that might have been pushed but never populated
  return logs.filter(
    (log) =>
      log.type !== 'bot' ||
      (log.steps && log.steps.length > 0) ||
      log.text.trim().length > 0 ||
      log.finalAnswer,
  );
}

/**
 * Redux-like reducer/helper that returns a shallow-copied LogEntry updated with
 * a new AgentStreamChunk, avoiding in-place state mutations.
 * Also dynamically controls the isThinking animation state.
 */
function updateLogWithChunk(
  targetLog: LogEntry,
  chunk: AgentStreamChunk,
  setIsThinking: (val: boolean) => void,
): LogEntry {
  const newLog = {
    ...targetLog,
    steps: targetLog.steps ? [...targetLog.steps] : [],
  };

  switch (chunk.type) {
    case 'thought': {
      setIsThinking(false);
      newLog.text = (newLog.text || '') + chunk.text;
      break;
    }
    case 'text': {
      setIsThinking(false);
      // Archive any completed thought segment when transitioning to the final answer
      if (newLog.text.trim()) {
        newLog.steps.push({
          type: 'thought',
          text: newLog.text,
        });
        newLog.text = '';
      }
      newLog.finalAnswer = (newLog.finalAnswer || '') + chunk.text;
      break;
    }
    case 'turn_completed':
      if (chunk.isEnd) {
        if (newLog.text.trim()) {
          newLog.steps.push({
            type: 'thought',
            text: newLog.text,
          });
        }
        if (newLog.finalAnswer) {
          newLog.finalAnswer = extractFinalAnswer(newLog.finalAnswer);
        }
        newLog.text = '';
        newLog.rawTurnText = '';
        newLog.isCollapsed = true;
        setIsThinking(false);
      } else {
        // Intermediate turn completed (e.g. going to call a tool).
        // Push current accumulated thought text to steps.
        if (newLog.text.trim()) {
          newLog.steps.push({
            type: 'thought',
            text: newLog.text,
          });
        }
        newLog.text = '';
        newLog.rawTurnText = '';
        // Turn completed but the agent is still running, so show the thinking spinner
        // while it executes tools or prepares the next turn.
        setIsThinking(true);
      }
      break;
    case 'tool_use':
      setIsThinking(true);
      newLog.steps.push({
        type: 'calling_tool',
        text: `${chunk.name} with ${JSON.stringify(chunk.input)}`,
      });
      break;
    case 'observation':
      newLog.steps.push({
        type: 'observation',
        text: chunk.content,
      });
      break;
    case 'warning':
      newLog.steps.push({
        type: 'warning',
        text: chunk.text,
      });
      break;
    case 'routing_decision':
      newLog.steps.push({
        type: 'routing',
        text: `→ ${chunk.specialists.map((s) => s.replace('_', '-')).join(', ')} — ${chunk.reason}`,
      });
      break;
    case 'specialist_start':
      newLog.steps.push({
        type: 'routing',
        text: `[${chunk.specialist.replace('_', '-')}]`,
      });
      break;
    case 'error':
      newLog.text = chunk.text;
      newLog.type = 'error';
      setIsThinking(false);
      break;
  }

  return newLog;
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
  onListConversations,
  onLoadConversation,
  onExitAgentSession,
}) => {
  const { Box, Text, useApp, useInput } = ink;
  const { exit } = useApp();
  const [mode, setMode] = useState<
    'PARENT_SHELL' | 'AGENT_SELECT' | 'CONVERSATION_SELECT' | 'CONVERSATION_CREATE' | 'AGENT_SESSION'
  >('PARENT_SHELL');
  const [activeAgent, setActiveAgent] = useState<RegistryCommand | null>(null);
  const [conversations, setConversations] = useState<Array<{ id: string; updatedAt: string }>>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitleError, setConversationTitleError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === 't') {
      setLogs((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].type === 'bot') {
            updated[i].isCollapsed = !updated[i].isCollapsed;
            break;
          }
        }
        return updated;
      });
    }
  });

  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draftInput, setDraftInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleUpArrow = () => {
    if (mode !== 'AGENT_SESSION') return;
    const userQueries = logs
      .filter((log) => log.type === 'user')
      .map((log) => log.text);

    if (userQueries.length === 0) return;

    if (historyIndex === null) {
      setDraftInput(input);
      const newIndex = userQueries.length - 1;
      setHistoryIndex(newIndex);
      setInput(userQueries[newIndex]);
    } else if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInput(userQueries[newIndex]);
    }
  };

  const handleDownArrow = () => {
    if (mode !== 'AGENT_SESSION') return;
    const userQueries = logs
      .filter((log) => log.type === 'user')
      .map((log) => log.text);

    if (userQueries.length === 0 || historyIndex === null) return;

    if (historyIndex < userQueries.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setInput(userQueries[newIndex]);
    } else {
      setHistoryIndex(null);
      setInput(draftInput);
      setDraftInput('');
    }
  };

  const welcomeAgents = agentRegistry.getAgents().map((agent) => ({
    name: agent.name().replace(/_/g, '-'),
    desc: agent.description() || 'No description available.',
  }));

  const handleAgentSelect = (item: { value: string }) => {
    setHistoryIndex(null);
    setDraftInput('');
    const targetAgent = agentRegistry.findAgent(item.value);
    if (targetAgent) {
      setActiveAgent(targetAgent);
      if (onListConversations) {
        onListConversations(targetAgent.name())
          .then((list) => {
            setConversations(list);
            if (list.length > 0) {
              setMode('CONVERSATION_SELECT');
            } else {
              setConversationTitleError(null);
              setMode('CONVERSATION_CREATE');
            }
          })
          .catch((err) => {
            setLogs((prev) => [
              ...prev,
              {
                type: 'error',
                text: `Failed to load conversations: ${getFriendlyErrorMessage(err)}`,
              },
            ]);
            setMode('PARENT_SHELL');
          });
      } else {
        setActiveConversationId('default');
        setMode('AGENT_SESSION');
      }
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

  const handleConversationSelect = (item: { value: string }) => {
    setHistoryIndex(null);
    setDraftInput('');
    if (!activeAgent) return;
    if (item.value === '__new__') {
      setConversationTitleError(null);
      setMode('CONVERSATION_CREATE');
    } else {
      if (onLoadConversation) {
        onLoadConversation(item.value)
          .then((history) => {
            const agentDisplayName = activeAgent.name().replace(/_/g, '-');
            const historyLogs = mapHistoryToLogs(history, agentDisplayName);

            setActiveConversationId(item.value);
            setLogs([
              {
                type: 'system',
                text: `Entered agent session: ${agentDisplayName} (Conversation: ${item.value}). Type :exit to return to parent shell.`,
              },
              ...historyLogs,
            ]);
            setMode('AGENT_SESSION');
          })
          .catch((err) => {
            setLogs((prev) => [
              ...prev,
              {
                type: 'error',
                text: `Failed to load conversation: ${getFriendlyErrorMessage(err)}`,
              },
            ]);
            setMode('PARENT_SHELL');
          });
      } else {
        setActiveConversationId('default');
        setMode('AGENT_SESSION');
      }
    }
  };

  const handleConversationCreateSubmit = (title: string) => {
    setHistoryIndex(null);
    setDraftInput('');
    if (!title.trim()) {
      setConversationTitleError('Title cannot be empty.');
      return;
    }
    const sanitized = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (!sanitized) {
      setConversationTitleError('Invalid title. Use letters and numbers.');
      return;
    }

    const exists = conversations.some((c) => c.id === sanitized);
    if (exists) {
      setConversationTitleError('A conversation with this name already exists.');
      return;
    }

    if (!activeAgent) return;
    const agentDisplayName = activeAgent.name().replace(/_/g, '-');

    setActiveConversationId(sanitized);
    setLogs([
      {
        type: 'system',
        text: `Entered agent session: ${agentDisplayName} (Conversation: ${sanitized}). Type :exit to return to parent shell.`,
      },
    ]);
    setInput('');
    setMode('AGENT_SESSION');
  };

  const handleSubmit = async (value: string) => {
    setInput('');
    setHistoryIndex(null);
    setDraftInput('');
    const action = shellRouter.resolve(value, mode === 'AGENT_SESSION');

    switch (action.type) {
      case 'EMPTY':
        break;

      case 'EXIT':
        if (mode === 'AGENT_SESSION' || mode === 'CONVERSATION_SELECT' || mode === 'CONVERSATION_CREATE') {
          onExitAgentSession?.(activeAgent?.name() ?? '');
          setActiveAgent(null);
          setActiveConversationId(null);
          setHistoryIndex(null);
          setDraftInput('');
          setMode('PARENT_SHELL');
        } else {
          setLogs((prev) => [...prev, { type: 'system', text: 'Goodbye!' }]);
          exit();
        }
        break;

      case 'CLEAR':
        setLogs([]);
        setHistoryIndex(null);
        setDraftInput('');
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
        if (!activeAgent || !activeConversationId) break;
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
          const stream = await onGetAgentStream(activeAgent.name(), message, activeConversationId);

          for await (const chunk of stream) {
            setLogs((prev) => {
              const updated = [...prev];
              const targetLog = updated[currentLogsLength];
              if (targetLog) {
                updated[currentLogsLength] = updateLogWithChunk(targetLog, chunk, setIsThinking);
              }
              return updated;
            });
          }
          setIsWaiting(false);
        } catch (err: unknown) {
          setIsThinking(false);
          setIsWaiting(false);
          const errMsg = getFriendlyErrorMessage(err);
          setLogs((prev) => {
            const updated = [...prev];
            const targetLog = updated[currentLogsLength];
            if (targetLog) {
              const newLog = { ...targetLog };
              newLog.text = errMsg;
              newLog.type = 'error';
              updated[currentLogsLength] = newLog;
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
          const availableAgents = agentRegistry
            .getAgents()
            .map((a) => `  • ${a.name().replace(/_/g, '-')}${a.description() ? ` — ${a.description()}` : ''}`)
            .join('\n');
          setLogs((prev) => [
            ...prev,
            {
              type: 'system',
              text: `Unknown command "${commandName}". Available agents:\n${availableAgents}`,
            },
          ]);
          break;
        }

        const message = (action.args || []).join(' ').trim();

        if (!message) {
          setLogs((prev) => [
            ...prev,
            {
              type: 'system',
              text: `Usage: :run ${commandName} <your message here>`,
            },
          ]);
          break;
        }

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
          const oneShotConvId = `oneshot-${Math.random().toString(36).substring(2, 10)}`;
          const stream = await onGetAgentStream(targetAgent.name(), message, oneShotConvId);

          for await (const chunk of stream) {
            setLogs((prev) => {
              const updated = [...prev];
              const targetLog = updated[currentLogsLength];
              if (targetLog) {
                updated[currentLogsLength] = updateLogWithChunk(targetLog, chunk, setIsThinking);
              }
              return updated;
            });
          }
          setIsWaiting(false);
        } catch (err: unknown) {
          setIsThinking(false);
          setIsWaiting(false);
          const errMsg = getFriendlyErrorMessage(err);
          setLogs((prev) => {
            const updated = [...prev];
            const targetLog = updated[currentLogsLength];
            if (targetLog) {
              const newLog = { ...targetLog };
              newLog.text = errMsg;
              newLog.type = 'error';
              updated[currentLogsLength] = newLog;
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

      {/* 5. Conversation Selection Menu */}
      {mode === 'CONVERSATION_SELECT' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            Select a conversation session for {activeAgent?.name().replace(/_/g, '-')}:
          </Text>
          <SelectInput
            items={[
              { label: '[+] Start a new conversation', value: '__new__' },
              ...conversations.map((c) => ({
                label: `• ${c.id} (updated ${new Date(c.updatedAt).toLocaleString()})`,
                value: c.id,
              })),
            ]}
            onSelect={handleConversationSelect}
          />
        </Box>
      )}

      {/* 6. Conversation Creation Menu */}
      {mode === 'CONVERSATION_CREATE' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            Enter a unique title/name for the new conversation:
          </Text>
          {conversationTitleError && (
            <Text color="red" bold>
              Error: {conversationTitleError}
            </Text>
          )}
          <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleConversationCreateSubmit}
            />
          </Box>
          <Box marginLeft={1} marginTop={0}>
            <Text color="gray" dimColor>
              press Enter to confirm title ∙ Type :exit to cancel and return to main shell
            </Text>
          </Box>
        </Box>
      )}

      {/* 7. Command line Prompt */}
      {mode !== 'AGENT_SELECT' && mode !== 'CONVERSATION_SELECT' && mode !== 'CONVERSATION_CREATE' && (
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
                : mode === 'PARENT_SHELL'
                  ? 'Select an agent to start (type :agents or :run <name>)...'
                  : 'Type a message...'
          }
          onUpArrow={handleUpArrow}
          onDownArrow={handleDownArrow}
        />
      )}
    </Box>
  );
};
