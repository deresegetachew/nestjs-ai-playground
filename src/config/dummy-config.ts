export const getDummyConfig = () => ({
  postgres: {
    host: 'localhost',
    port: 5432,
    username: 'dummy',
    password: 'dummy',
    database: 'dummy',
    synchronize: false,
    schema: 'public',
  },
  port: 3000,
  gemini: {
    apiKey: 'dummy',
  },
  openai: {
    apiKey: 'dummy',
  },
  weatherAPIKey: 'dummy',
  ai: {
    vendor: 'gemini' as const,
    model: 'gemini-2.0-flash',
    timeoutMs: 60000,
    toolTimeoutMs: 15000,
    contextWindowLimit: 1048576,
    retry: {
      maxRetries: 3,
      initialDelayMs: 1000,
      overloadDelayMs: 5000,
    },
  },
  telemetry: {
    otelExporterUrl: 'http://localhost:4318/v1/logs',
    serviceName: 'nestjs-ai-playground',
    instrumentations: {
      fs: false,
      http: true,
      express: true,
      nest: true,
    },
  },
});
