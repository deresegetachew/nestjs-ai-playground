import { validateOutputText } from './output.guardrail';
import { ZodError } from 'zod';

describe('output.guardrail', () => {
  it('should pass normal output text', () => {
    const text = 'Here is the weather forecast for today.';
    const res = validateOutputText(text);
    expect(res).toBe(text);
  });

  it('should reject empty output', () => {
    expect(() => validateOutputText('')).toThrow(ZodError);
  });

  it('should reject too long output (>10000 characters)', () => {
    const longText = 'a'.repeat(10001);
    expect(() => validateOutputText(longText)).toThrow(ZodError);
  });

  it('should reject output containing SSN PII pattern', () => {
    const textWithPII = 'My social security number is 123-45-6789.';
    expect(() => validateOutputText(textWithPII)).toThrow(
      'Output rejected: potential PII detected.',
    );
  });

  it('should reject output containing credit card PII pattern', () => {
    const textWithCC = 'Please refund to my card 1234-5678-9012-3456.';
    expect(() => validateOutputText(textWithCC)).toThrow(
      'Output rejected: potential PII detected.',
    );
  });

  it('should pass output containing floating-point decimal numbers', () => {
    const textWithFloat = '8 divided by 6 is 1.3333333333333333.';
    const res = validateOutputText(textWithFloat);
    expect(res).toBe(textWithFloat);
  });

  it('should pass output containing large decimal numbers followed by a decimal point', () => {
    const textWithLargeFloat = 'Value: 1333333333333333.1';
    const res = validateOutputText(textWithLargeFloat);
    expect(res).toBe(textWithLargeFloat);
  });
});
