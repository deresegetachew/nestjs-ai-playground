import { z } from 'zod';
import { Tool } from '../ports/tool.interface';
import { AgentToolDefinition } from '../ports/agent-types';
import { sanitiseToolSchema } from './schema.utils';

export function mapToolToDefinition(tool: Tool): AgentToolDefinition {
  const jsonSchema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  const description = tool.deprecated
    ? `[DEPRECATED: ${tool.deprecationMessage ?? 'use the newer version of this tool'}] ${tool.description}`
    : tool.description;
  return {
    name: tool.name,
    description,
    inputSchema: sanitiseToolSchema(jsonSchema),
  };
}
