import { AgentRegistry, RegistryCommand } from './agent.registry';

describe('AgentRegistry', () => {
  let mockShellCommand: RegistryCommand;
  let mockChatbotCommand: RegistryCommand;

  beforeEach(() => {
    mockShellCommand = {
      name: () => 'shell',
      description: () => 'interactive shell',
      exitOverride: jest.fn(),
      parseAsync: jest.fn(),
    };

    mockChatbotCommand = {
      name: () => 'simple_chatbot',
      description: () => 'simple chatbot',
      exitOverride: jest.fn(),
      parseAsync: jest.fn(),
    };
  });

  it('should filter out shell command from agent list', () => {
    const registry = new AgentRegistry([mockShellCommand, mockChatbotCommand]);
    expect(registry.getAgents()).toHaveLength(1);
    expect(registry.getAgents()[0].name()).toBe('simple_chatbot');
  });

  it('should get normalized agent display names', () => {
    const registry = new AgentRegistry([mockShellCommand, mockChatbotCommand]);
    expect(registry.getAgentNames()).toEqual(['simple-chatbot']);
  });

  it('should find agent command by display name or normalized name case-insensitively', () => {
    const registry = new AgentRegistry([mockShellCommand, mockChatbotCommand]);

    // Match exact name
    expect(registry.findAgent('simple-chatbot')).toBe(mockChatbotCommand);
    expect(registry.findAgent('simple_chatbot')).toBe(mockChatbotCommand);

    // Match case-insensitively
    expect(registry.findAgent('Simple-Chatbot')).toBe(mockChatbotCommand);

    // Non-matching agent
    expect(registry.findAgent('unknown-agent')).toBeUndefined();
  });
});
