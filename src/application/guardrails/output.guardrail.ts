import { z } from 'zod';

export const AgentOutputSchema = z.object({
  action: z.enum(['search', 'summarise', 'done']),
  query: z.string().optional(),
  result: z.string().optional(),
});

/**
 * Validates the model's string output against a Zod schema.
 * Throws an Error if the output is not valid JSON, or a ZodError if the schema is violated.
 */
export function validateOutputSchema<T>(
  output: string,
  schema: z.Schema<T>,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(
      'Model returned non-JSON output. Prompt may need adjustment.',
    );
  }
  return schema.parse(parsed);
}
