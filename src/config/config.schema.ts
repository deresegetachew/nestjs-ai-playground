import { z } from 'zod';

export const configSchema = z.object({
  postgres: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string().min(1),
    database: z.string().min(1),
    schema: z.string().optional(),
    synchronize: z.boolean(),
    databaseUrl: z.string().optional(),
  }),
  port: z.number().int().positive().default(3000),
  gemini: z.object({
    apiKey: z.string().min(1),
  }),
  openai: z
    .object({
      apiKey: z.string().min(1),
    })
    .optional(),
  ai: z
    .object({
      vendor: z.enum(['gemini', 'openai']).default('gemini'),
      model: z.string().optional(),
    })
    .default({ vendor: 'gemini' }),
});

export type AppConfig = z.infer<typeof configSchema>;
