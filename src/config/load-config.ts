/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { execSync } from 'child_process';
import * as YAML from 'yaml';
import * as fs from 'fs';
import { AppConfig, configSchema } from './config.schema';
import { getDummyConfig } from './dummy-config';

export function loadConfig(): AppConfig {
  // 1. Fast path for OpenAPI export (no secrets needed)
  if (process.env.EXPORT_OPENAPI === 'true') {
    console.warn(`⚠️  Using dummy config for OpenAPI export.`);
    return getDummyConfig();
  }

  const env = process.env.NODE_ENV || 'dev';
  // Secrets are at workspace root, not in the package directory
  const workspaceRoot = process.cwd().includes('packages/fw_backend')
    ? process.cwd().replace('/packages/fw_backend', '')
    : process.cwd();
  const secretsPath = `${workspaceRoot}/secrets/${env}.yaml`;

  // Enforce secrets file existence for ALL environments
  console.log(`🔍 Loading secrets from: ${secretsPath}`);
  if (!fs.existsSync(secretsPath)) {
    console.error(`❌ Secrets file NOT FOUND at: ${secretsPath}`);
    throw new Error(
      `❌ Error: secrets/${env}.yaml not found. Environment requires explicit secrets file.`,
    );
  }

  let decrypted: string;
  try {
    decrypted = execSync(`sops -d ${secretsPath}`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    // We can allow SOPS to fail in test environment
    if (env === 'test') {
      console.warn(
        `⚠️  SOPS decryption failed for ${secretsPath}. Proceeding with isolated defaults and ENV overrides.`,
      );
      decrypted = YAML.stringify({
        postgres: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5433', 10),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_DATABASE || 'first_thousand_words_test',
          synchronize: true,
        },
        gemini: { apiKey: process.env.GEMINI_API_KEY || 'dummy' },
        openai: { apiKey: process.env.OPENAI_API_KEY || 'dummy' },
        weatherAPIKey: process.env.WEATHER_API_KEY || 'dummy',
      });
    } else {
      throw new Error(
        `Failed to decrypt secrets file: ${secretsPath}. ` +
          `Ensure SOPS is installed and the AGE key is available. ` +
          `Error: ${errMessage}`,
      );
    }
  }

  const config = YAML.parse(decrypted);

  // 2. Apply Environment Overrides BEFORE validation

  // Prioritize DATABASE_URL if provided
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      config.postgres.databaseUrl = process.env.DATABASE_URL;
      config.postgres.host = url.hostname;
      config.postgres.port = parseInt(url.port, 10) || 5432;
      config.postgres.username = url.username;
      config.postgres.password = url.password;
      config.postgres.database = url.pathname.substring(1); // remove leading /
    } catch {
      console.error(
        'Invalid DATABASE_URL format. Expected postgres://user:pass@host:port/dbname',
      );
    }
  }

  // Individual DB Overrides
  if (process.env.DB_SCHEMA) config.postgres.schema = process.env.DB_SCHEMA;
  if (process.env.DB_SYNCHRONIZE !== undefined)
    config.postgres.synchronize = process.env.DB_SYNCHRONIZE === 'true';
  if (process.env.DB_HOST) config.postgres.host = process.env.DB_HOST;
  if (process.env.DB_USER) config.postgres.username = process.env.DB_USER;
  if (process.env.DB_PASSWORD)
    config.postgres.password = process.env.DB_PASSWORD;
  if (process.env.DB_PORT)
    config.postgres.port = parseInt(process.env.DB_PORT, 10);
  if (process.env.DB_DATABASE)
    config.postgres.database = process.env.DB_DATABASE;

  // App Port
  if (process.env.PORT) config.port = parseInt(process.env.PORT, 10);

  // Gemini Overrides
  if (process.env.GEMINI_API_KEY)
    config.gemini.apiKey = process.env.GEMINI_API_KEY;

  // OpenAI Overrides
  if (process.env.OPENAI_API_KEY) {
    if (!config.openai) config.openai = {};
    config.openai.apiKey = process.env.OPENAI_API_KEY;
  }

  // Weather Overrides
  if (process.env.WEATHER_API_KEY) {
    config.weatherAPIKey = process.env.WEATHER_API_KEY;
  }

  // AI Overrides
  if (!config.ai) config.ai = {};
  if (process.env.AI_VENDOR) config.ai.vendor = process.env.AI_VENDOR;
  if (process.env.AI_MODEL) config.ai.model = process.env.AI_MODEL;

  if (!config.audioParser) config.audioParser = {};

  if (process.env.AUDIO_PARSER_PATH) {
    config.audioParser.path = process.env.AUDIO_PARSER_PATH;
  }

  // Safety Guarantee: Refuse to run in "e2e mode" if NODE_ENV is not test
  if (process.env.RUN_E2E === 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Safety Guarantee Failed: E2E tests must run with NODE_ENV=test',
    );
  }

  try {
    // 3. Validate the final merged configuration
    const validated = configSchema.parse(config);

    if (process.env.NODE_ENV === 'test') {
      console.log(
        `🚀 Config Overrides - DB_USER: ${process.env.DB_USER}, DB_PORT: ${process.env.DB_PORT}, DB_DATABASE: ${process.env.DB_DATABASE}`,
      );
      console.log(
        `🚀 Final Config - host: ${validated.postgres.host}, port: ${validated.postgres.port}, user: ${validated.postgres.username}, db: ${validated.postgres.database}`,
      );
    }

    return validated;
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Configuration validation failed for ${secretsPath}: ${errMessage}`,
    );
  }
}
