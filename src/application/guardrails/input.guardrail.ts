import { z } from 'zod';

export const UserInputSchema = z.string().min(1).max(4000);

const INJECTION_PATTERNS = [
  /ignore (?:previous|all) instructions/i,
  /you are now/i,
  /act as (?:an? )?(?:unrestricted|jailbreak)/i,
  /disregard (?:the )?(?:above|previous)/i,
  /forget everything/i,
  /pretend (?:to be|you are)/i,
  /new (?:role|persona|identity)/i,
  /reveal (?:your )?(?:system )?prompt/i,
  /what (?:were|are) your (?:instructions|rules)/i,
];

// Card numbers and SSNs have no legitimate reason to appear in a support chat message.
// Emails and phone numbers are intentionally excluded — customers need them for
// update_email requests and account lookups.
const PII_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    // 13–19 contiguous digits, or groups of 4 separated by spaces/dashes — catches
    // Visa, Mastercard, Amex, Discover, etc. while avoiding short numeric IDs.
    pattern: /\b(?:\d[ -]?){15,18}\d\b|\b\d{16}\b/,
    label: 'credit/debit card number',
  },
  {
    // SSN in any common delimiter format: 123-45-6789 or 123 45 6789
    pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/,
    label: 'Social Security Number',
  },
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

  if (INJECTION_PATTERNS.some((p) => p.test(parsed))) {
    throw new Error('Input rejected: policy violation.');
  }

  const piiMatch = PII_PATTERNS.find(({ pattern }) => pattern.test(parsed));
  if (piiMatch) {
    throw new Error(
      `Input rejected: please do not share your ${piiMatch.label} in chat. Contact us via a secure channel.`,
    );
  }

  return parsed;
}



