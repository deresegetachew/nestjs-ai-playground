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
  weatherAPIKey: z.string().optional(),
  ai: z
    .object({
      vendor: z.enum(['gemini', 'openai']).default('gemini'),
      model: z.string().optional(),
      timeoutMs: z.number().int().positive().default(60000),
      toolTimeoutMs: z.number().int().positive().default(15000),
      contextWindowLimit: z.number().int().positive().default(1048576),
      retry: z
        .object({
          maxRetries: z.number().int().positive().default(3),
          initialDelayMs: z.number().int().positive().default(1000),
          overloadDelayMs: z.number().int().positive().default(5000),
        })
        .default({
          maxRetries: 3,
          initialDelayMs: 1000,
          overloadDelayMs: 5000,
        }),
    })
    .default({
      vendor: 'gemini',
      timeoutMs: 60000,
      toolTimeoutMs: 15000,
      contextWindowLimit: 1048576,
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        overloadDelayMs: 5000,
      },
    }),
  telemetry: z
    .object({
      otelExporterUrl: z.string().url().default('http://localhost:4318/v1/logs'),
      serviceName: z.string().default('nestjs-ai-playground'),
      instrumentations: z
        .object({
          fs: z.boolean().default(false),
          http: z.boolean().default(true),
          express: z.boolean().default(true),
          nest: z.boolean().default(true),
        })
        .default({
          fs: false,
          http: true,
          express: true,
          nest: true,
        }),
    })
    .default({
      otelExporterUrl: 'http://localhost:4318/v1/logs',
      serviceName: 'nestjs-ai-playground',
      instrumentations: {
        fs: false,
        http: true,
        express: true,
        nest: true,
      },
    }),
});

export type AppConfig = z.infer<typeof configSchema>;
