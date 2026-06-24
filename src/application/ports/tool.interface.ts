import { z } from 'zod';

export interface Tool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodSchema<TInput>;
  execute(input: TInput): Promise<TOutput>;
}
