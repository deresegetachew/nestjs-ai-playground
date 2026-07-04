/**
 * Sanitises a JSON Schema object for use with LLM function-calling APIs.
 *
 * `z.toJSONSchema()` produces JSON Schema draft 2020-12, which includes fields
 * that most LLM APIs do not support in their tool parameter schemas. When these
 * fields are present, vendors (e.g. Gemini) silently drop the entire function
 * declarations list, causing the model to describe tool calls in plain text
 * instead of invoking them via the native function-calling API.
 *
 * Fields stripped:
 *   - `$schema`            — draft identifier, not understood by LLM APIs
 *   - `additionalProperties` — not part of most vendor Schema types
 *   - `default`            — silently breaks Gemini function declaration parsing
 *   - `$defs` / `$ref`     — vendors do not resolve JSON Schema references
 *
 * Fields converted:
 *   - `const`              — z.literal() generates `{ "const": <value> }` which Gemini
 *                            rejects. Converted to `{ "type": "<inferred>" }` instead.
 *
 * This function is vendor-agnostic and should be used by all vendor mappers
 * (Gemini, OpenAI, Anthropic, etc.) when converting tool input schemas.
 */
export function sanitiseToolSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const STRIP_KEYS = new Set([
    '$schema',
    'additionalProperties',
    'default',
    '$defs',
    '$ref',
  ]);

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (STRIP_KEYS.has(key)) continue;

    // z.literal() produces { "const": <value> } — Gemini rejects this field.
    // Map it to the equivalent JSON Schema type so the field remains typed.
    if (key === 'const') {
      if (!('type' in schema)) {
        cleaned['type'] =
          typeof value === 'boolean' ? 'boolean'
          : typeof value === 'number'  ? 'number'
          : 'string';
      }
      continue;
    }

    if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recurse into each property schema
      const cleanedProps: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(
        value as Record<string, unknown>,
      )) {
        cleanedProps[propKey] =
          typeof propVal === 'object' && propVal !== null
            ? sanitiseToolSchema(propVal as Record<string, unknown>)
            : propVal;
      }
      cleaned[key] = cleanedProps;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}
