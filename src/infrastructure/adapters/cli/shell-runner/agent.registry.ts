export interface RegistryCommand {
  name(): string;
  description(): string;
  exitOverride(): void;
  parseAsync(argv: string[]): Promise<unknown>;
}

export class AgentRegistry {
  private readonly agents: RegistryCommand[];

  constructor(commands: RegistryCommand[]) {
    this.agents = commands.filter((c) => c.name() !== 'shell');
  }

  /**
   * Get all registered agent commands.
   */
  getAgents(): RegistryCommand[] {
    return this.agents;
  }

  /**
   * Find an agent command by its display name (with hyphens) or normalized name (with underscores).
   */
  findAgent(rawName: string): RegistryCommand | undefined {
    const targetName = rawName.replace(/-/g, '_').toLowerCase();
    return this.agents.find(
      (agent) => agent.name().toLowerCase() === targetName,
    );
  }

  /**
   * Get all available agent display names (hyphenated).
   */
  getAgentNames(): string[] {
    return this.agents.map((agent) => agent.name().replace(/_/g, '-'));
  }
}
