import { AgentMessage } from './agent-message';

export class Conversation {
  private constructor(
    public readonly id: string,
    public readonly agentName: string,
    private _messages: AgentMessage[],
    public readonly updatedAt: Date,
  ) {}

  static create(id: string, agentName: string, messages: AgentMessage[] = []): Conversation {
    if (!id) {
      throw new Error('Conversation ID is required.');
    }
    if (!agentName) {
      throw new Error('Agent name is required.');
    }
    return new Conversation(id, agentName, [...messages], new Date());
  }

  get messages(): AgentMessage[] {
    return [...this._messages];
  }

  addMessage(message: AgentMessage): void {
    this._messages.push(message);
    (this as any).updatedAt = new Date();
  }

  clearHistory(): void {
    this._messages = [];
    (this as any).updatedAt = new Date();
  }
}
