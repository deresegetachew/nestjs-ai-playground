import React from 'react';
import { ShellUI } from './ShellUI';
import { AgentRegistry } from '../agent.registry';
import { ShellRouter } from '../shell.router';
import { WelcomeBanner } from './components/WelcomeBanner';
import { LogItem } from './components/LogItem';
import { ThinkingSpinner } from './components/ThinkingSpinner';
import { PromptInput } from './components/PromptInput';
import { of } from 'rxjs';
import { reactMockControl } from './react-mock-setup';

// We can keep these mock implementations simple so they don't crash
jest.mock('./components/WelcomeBanner', () => ({ WelcomeBanner: () => null }));
jest.mock('./components/LogItem', () => ({ LogItem: () => null, getFriendlyErrorMessage: (e: any) => String(e) }));
jest.mock('./components/ThinkingSpinner', () => ({ ThinkingSpinner: () => null }));
jest.mock('./components/PromptInput', () => ({ PromptInput: () => null }));

describe('ShellUI State Management', () => {
  const mockInk = {
    Box: ({ children }: any) => children,
    Text: ({ children }: any) => children,
    useApp: () => ({
      exit: jest.fn(),
    }),
    useInput: jest.fn(),
  } as any;

  const mockSelectInput = () => null;
  const mockTextInput = () => null;
  const mockSpinner = () => null;

  let agentRegistry: AgentRegistry;
  let shellRouter: ShellRouter;
  let onGetAgentStream: jest.Mock;

  beforeEach(() => {
    reactMockControl.reset();

    const mockAgentsList = [
      {
        name: () => 'simple_chatbot',
        description: () => 'Simple bot',
      },
    ] as any;

    agentRegistry = new AgentRegistry(mockAgentsList);
    shellRouter = new ShellRouter();
    onGetAgentStream = jest.fn().mockResolvedValue(
      of(
        { type: 'text', text: 'bot response chunk' },
        { type: 'turn_completed', isEnd: true },
      ),
    );
  });

  function findElement(node: any, type: any): any {
    if (!node) return null;
    if (node.type === type) return node;
    if (node.props && node.props.children) {
      if (Array.isArray(node.props.children)) {
        for (const child of node.props.children) {
          const found = findElement(child, type);
          if (found) return found;
        }
      } else {
        return findElement(node.props.children, type);
      }
    }
    return null;
  }

  const renderComponent = () => {
    reactMockControl.resetIndex();
    return ShellUI({
      ink: mockInk,
      TextInput: mockTextInput,
      SelectInput: mockSelectInput,
      Spinner: mockSpinner,
      agentRegistry,
      shellRouter,
      onGetAgentStream,
    });
  };

  it('should render ShellUI and handle agent selection', async () => {
    // 1. Initial Render
    let tree = renderComponent();

    // 2. Open Agent Selection Menu (via Submit command "agent")
    const promptElement = findElement(tree, PromptInput);
    expect(promptElement).toBeDefined();
    expect(promptElement.props.onSubmit).toBeDefined();

    // Submit "agent" command
    promptElement.props.onSubmit('agent');

    // Re-render
    tree = renderComponent();

    // Verify we are now in AGENT_SELECT mode (PromptInput should not render, SelectInput should)
    const selectElement = findElement(tree, mockSelectInput);
    expect(selectElement).toBeDefined();
    expect(selectElement.props.onSelect).toBeDefined();

    // Select the agent
    selectElement.props.onSelect({ value: 'simple-chatbot' });

    // Re-render
    tree = renderComponent();

    // Now inside AGENT_SESSION, find PromptInput again
    const promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession).toBeDefined();

    // Send chat message
    await promptElementSession.props.onSubmit('hello bot');
    expect(onGetAgentStream).toHaveBeenCalledWith('simple_chatbot', 'hello bot');
  });

  it('should handle parent commands like clear and exit', () => {
    const mockExit = jest.fn();
    const customInk = {
      ...mockInk,
      useApp: () => ({ exit: mockExit }),
      useInput: jest.fn(),
    } as any;

    reactMockControl.reset();
    let tree = ShellUI({
      ink: customInk,
      TextInput: mockTextInput,
      SelectInput: mockSelectInput,
      Spinner: mockSpinner,
      agentRegistry,
      shellRouter,
      onGetAgentStream,
    });

    const promptElement = findElement(tree, PromptInput);

    // Clear logs
    promptElement.props.onSubmit('clear');
    // Exit parent shell
    promptElement.props.onSubmit('exit');
    expect(mockExit).toHaveBeenCalled();
  });

  it('should handle direct agent commands', () => {
    let tree = renderComponent();
    const promptElement = findElement(tree, PromptInput);

    // Execute direct command "simple-chatbot count to 5"
    promptElement.props.onSubmit('simple-chatbot count to 5');
    expect(onGetAgentStream).toHaveBeenCalledWith('simple_chatbot', 'count to 5');
  });
});
