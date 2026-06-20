import { validateOutputSchema, AgentOutputSchema } from './output.guardrail';
import { ZodError } from 'zod';

describe('output.guardrail', () => {
  it('should pass valid JSON that matches the schema', () => {
    const raw = '{"action": "search", "query": "NestJS AI"}';
    const res = validateOutputSchema(raw, AgentOutputSchema);
    expect(res).toEqual({
      action: 'search',
      query: 'NestJS AI',
    });
  });

  it('should reject non-JSON output', () => {
    const raw = 'This is not JSON';
    expect(() => validateOutputSchema(raw, AgentOutputSchema)).toThrow(
      'Model returned non-JSON output',
    );
  });

  it('should reject JSON that violates the schema constraints', () => {
    const raw = '{"action": "invalid_action"}';
    expect(() => validateOutputSchema(raw, AgentOutputSchema)).toThrow(
      ZodError,
    );
  });
});
