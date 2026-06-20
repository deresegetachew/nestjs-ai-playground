export type RouterActionType =
  | 'EXIT'
  | 'CLEAR'
  | 'AGENT_MENU'
  | 'AGENT_SELECT'
  | 'CHAT'
  | 'EXECUTE_AGENT_COMMAND'
  | 'EMPTY';

export interface RouterAction {
  type: RouterActionType;
  payload?: string;
  args?: string[];
}

export class ShellRouter {
  /**
   * Resolve an input line to a structured CLI action.
   */
  resolve(input: string, isInAgentSession: boolean): RouterAction {
    const trimmed = input.trim();
    if (!trimmed) {
      return { type: 'EMPTY' };
    }

    if (isInAgentSession) {
      if (trimmed.toLowerCase() === ':exit') {
        return { type: 'EXIT' };
      }
      if (trimmed.toLowerCase() === 'clear') {
        return { type: 'CLEAR' };
      }
      return { type: 'CHAT', payload: trimmed };
    }

    // Parent Shell Mode
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      return { type: 'EXIT' };
    }
    if (trimmed.toLowerCase() === 'clear') {
      return { type: 'CLEAR' };
    }

    // Check for agent menus or agent selections
    const normalized = trimmed.replace(/\s+/g, ' ');
    if (
      normalized.toLowerCase() === 'agent' ||
      normalized.toLowerCase().startsWith('agent ') ||
      normalized.toLowerCase().startsWith('agent:')
    ) {
      if (normalized.toLowerCase() === 'agent') {
        return { type: 'AGENT_MENU' };
      }
      const rawAgentName = normalized.toLowerCase().startsWith('agent ')
        ? normalized.substring(6).trim()
        : normalized.substring(6).trim();

      return { type: 'AGENT_SELECT', payload: rawAgentName };
    }

    const args = this.parseArgs(trimmed);
    if (args.length === 0) {
      return { type: 'EMPTY' };
    }

    return {
      type: 'EXECUTE_AGENT_COMMAND',
      payload: args[0],
      args: args.slice(1),
    };
  }

  /**
   * Split command line strings into argument arrays, respecting single/double quotes.
   */
  private parseArgs(line: string): string[] {
    const args: string[] = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      args.push(match[1] ?? match[2] ?? match[0]);
    }
    return args;
  }
}
