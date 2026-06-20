import { z } from 'zod';

export const UserInputSchema = z.string().min(1).max(4000);

const INJECTION_PATTERNS = [
  /ignore (?:previous|all) instructions/i,
  /you are now/i,
  /act as (?:an? )?(?:unrestricted|jailbreak)/i,
];

/**
 * Sanitizes and validates the user input prompt.
 * Throws a ZodError if validation fails, or an Error if a policy violation occurs.
 */
export function validateAndSanitizeInput<T extends string>(
  message: string,
  schema: z.Schema<T>,
): T {
  const parsed = schema.parse(message);

  // Basic prompt injection defense
  if (INJECTION_PATTERNS.some((p) => p.test(parsed))) {
    throw new Error('Input rejected: policy violation.');
  }

  return parsed;
}
