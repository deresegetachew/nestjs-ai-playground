import { z } from 'zod';

export const AgentOutputSchema = z
  .string()
  .min(1, 'Model returned an empty response.')
  .max(10000, 'Model response exceeded length limit.');

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /(?<!\.)\b(?:\d[ -]*?){13,16}\b(?!\.\d)/, // Basic Credit Card (ignoring floating point decimals)
];

/**
 * Validates the model's free-text output.
 * Checks for response length, empty responses, and basic PII.
 */
export function validateOutputText(text: string): string {
  const validated = AgentOutputSchema.parse(text);

  if (PII_PATTERNS.some((p) => p.test(validated))) {
    throw new Error('Output rejected: potential PII detected.');
  }

  return validated;
}
