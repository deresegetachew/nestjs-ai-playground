import { AgentMessage } from '../ports/agent-types';

export class AskSimpleChatbotCommand {
  public readonly message: string;
  public readonly history: AgentMessage[];

  constructor(
    message: string,
    history: AgentMessage[] = [],
  ) {
    this.message = message;
    this.history = history;
  }
}

