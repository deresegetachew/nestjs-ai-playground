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
  ai: {
    vendor: 'gemini' as const,
    model: 'gemini-2.0-flash',
  },
});
