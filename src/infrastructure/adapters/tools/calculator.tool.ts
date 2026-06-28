import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../application/ports/tool.interface';

import { evaluate } from 'mathjs';

const CalculatorInputSchema = z.object({
  expression: z
    .string()
    .describe('The math expression to evaluate, e.g. "2 + 2"'),
});

type CalculatorInput = z.infer<typeof CalculatorInputSchema>;

@Injectable()
export class CalculatorTool implements Tool<CalculatorInput, number> {
  readonly name = 'calculator';
  readonly description =
    'Evaluate mathematical expressions. ' + 'Returns a number.';
  readonly version = '1';
  readonly schema = CalculatorInputSchema;

  async execute(input: CalculatorInput): Promise<number> {
    try {
      const result = evaluate(input.expression);
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a number.');
      }
      return result;
    } catch (error: any) {
      if (error?.message === 'Expression did not evaluate to a number.') {
        throw error;
      }
      throw new Error(`Failed to evaluate expression: ${error?.message || error}`);
    }
  }
}
