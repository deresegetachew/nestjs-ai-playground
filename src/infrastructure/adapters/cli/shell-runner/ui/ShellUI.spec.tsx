import React from 'react';
import { ShellUI } from './ShellUI';
import { AgentRegistry } from '../agent.registry';
import { ShellRouter } from '../shell.router';
import { WelcomeBanner } from './components/WelcomeBanner';
import { LogItem } from './components/LogItem';
import { ThinkingSpinner } from './components/ThinkingSpinner';
import { PromptInput } from './components/PromptInput';
import { reactMockControl } from '../../../../../test-setup';

async function* toAsyncIterable<T>(...items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

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
      toAsyncIterable(
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
    expect(onGetAgentStream).toHaveBeenCalledWith('simple_chatbot', 'hello bot', expect.any(String));
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

  function findAllElements(node: any, type: any): any[] {
    const results: any[] = [];
    function traverse(n: any) {
      if (!n) return;
      if (Array.isArray(n)) {
        for (const item of n) {
          traverse(item);
        }
        return;
      }
      if (n.type === type) {
        results.push(n);
      }
      if (n.props && n.props.children) {
        traverse(n.props.children);
      }
    }
    traverse(node);
    return results;
  }

  it('should handle direct agent commands', () => {
    let tree = renderComponent();
    const promptElement = findElement(tree, PromptInput);

    // Execute direct command "simple-chatbot count to 5"
    promptElement.props.onSubmit('simple-chatbot count to 5');
    expect(onGetAgentStream).toHaveBeenCalledWith('simple_chatbot', 'count to 5', expect.any(String));
  });

  it('should stream agent response and split thoughts from finalAnswer in real-time', async () => {
    // Mock the agent stream to emit text chunks with Thoughts and a Final Answer
    onGetAgentStream.mockResolvedValue(
      toAsyncIterable(
        { type: 'thought', text: 'Thought: Let me calculate.' },
        { type: 'text', text: '\nFinal Answer: The answer is 42.' },
        { type: 'turn_completed', isEnd: true },
      ),
    );

    // 1. Initial Render and Agent Session Setup
    let tree = renderComponent();
    const promptElement = findElement(tree, PromptInput);
    promptElement.props.onSubmit('agent');

    tree = renderComponent();
    const selectElement = findElement(tree, mockSelectInput);
    selectElement.props.onSelect({ value: 'simple-chatbot' });

    // 2. Submit Chat Message and await stream completion
    tree = renderComponent();
    const promptElementSession = findElement(tree, PromptInput);
    promptElementSession.props.onSubmit('compute 42');

    // Wait for async stream to flush state updates
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 3. Verify LogItem logs
    tree = renderComponent();
    const logItems = findAllElements(tree, LogItem);
    
    // User message
    expect(logItems[0].props.log).toEqual({ type: 'user', text: 'compute 42' });
    
    // Bot message (collapsed thoughts and finalized finalAnswer)
    expect(logItems[1].props.log).toEqual({
      type: 'bot',
      agentName: 'simple-chatbot',
      text: '',
      rawTurnText: '',
      finalAnswer: 'The answer is 42.',
      isCollapsed: true,
      steps: [
        {
          type: 'thought',
          text: 'Thought: Let me calculate.',
        },
      ],
    });
  });

  it('should accumulate thoughts, tool calls, and observations during intermediate turns', async () => {
    onGetAgentStream.mockResolvedValue(
      toAsyncIterable(
        { type: 'thought', text: 'Thought: Check weather.' },
        { type: 'tool_use', name: 'get_weather', input: { city: 'London' } },
        { type: 'turn_completed', isEnd: false },
        { type: 'observation', content: 'Rainy 15C' },
        { type: 'text', text: '\nFinal Answer: It is raining.' },
        { type: 'turn_completed', isEnd: true },
      ),
    );

    let tree = renderComponent();
    const promptElement = findElement(tree, PromptInput);
    promptElement.props.onSubmit('agent');

    tree = renderComponent();
    const selectElement = findElement(tree, mockSelectInput);
    selectElement.props.onSelect({ value: 'simple-chatbot' });

    tree = renderComponent();
    const promptElementSession = findElement(tree, PromptInput);
    promptElementSession.props.onSubmit('weather today');

    // Wait for async stream to flush state updates
    await new Promise((resolve) => setTimeout(resolve, 10));

    tree = renderComponent();
    const logItems = findAllElements(tree, LogItem);

    expect(logItems[1].props.log).toEqual({
      type: 'bot',
      agentName: 'simple-chatbot',
      text: '',
      rawTurnText: '',
      finalAnswer: 'It is raining.',
      isCollapsed: true,
      steps: [
        { type: 'calling_tool', text: 'get_weather with {"city":"London"}' },
        { type: 'thought', text: 'Thought: Check weather.' },
        { type: 'observation', text: 'Rainy 15C' },
      ],
    });
  });

  it('should support up/down arrow history navigation in agent session', async () => {
    // 1. Initial Render and Agent Session Setup
    let tree = renderComponent();
    const promptElement = findElement(tree, PromptInput);
    promptElement.props.onSubmit('agent');

    tree = renderComponent();
    const selectElement = findElement(tree, mockSelectInput);
    selectElement.props.onSelect({ value: 'simple-chatbot' });

    // 2. Submit user queries
    tree = renderComponent();
    let promptElementSession = findElement(tree, PromptInput);

    onGetAgentStream.mockResolvedValue(
      toAsyncIterable(
        { type: 'text', text: 'ok' },
        { type: 'turn_completed', isEnd: true },
      ),
    );

    await promptElementSession.props.onSubmit('question one');
    
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    await promptElementSession.props.onSubmit('question two');

    // 3. Navigate history
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    
    // Set a draft input
    promptElementSession.props.setInput('draft text');
    
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('draft text');

    // Press Up arrow: should load the last question ('question two')
    promptElementSession.props.onUpArrow();
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('question two');

    // Press Up arrow again: should load 'question one'
    promptElementSession.props.onUpArrow();
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('question one');

    // Press Up arrow again: should stay on the oldest history item ('question one')
    promptElementSession.props.onUpArrow();
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('question one');

    // Press Down arrow: should go forward to 'question two'
    promptElementSession.props.onDownArrow();
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('question two');

    // Press Down arrow again: should restore the draft input
    promptElementSession.props.onDownArrow();
    tree = renderComponent();
    promptElementSession = findElement(tree, PromptInput);
    expect(promptElementSession.props.input).toBe('draft text');
  });
});
