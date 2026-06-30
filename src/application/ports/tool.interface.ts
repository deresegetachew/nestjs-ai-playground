import { z } from 'zod';

export interface Tool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodSchema<TInput>;
  readonly version: string;             // required — '1', '2', '1.2.0'
  readonly deprecated?: boolean;
  readonly deprecationMessage?: string; // 'Use weather_v2 — supports units parameter'
  execute(input: TInput): Promise<TOutput>;
}
