import './infrastructure/tracing/telemetry';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';
import { TelemetryLogger } from './infrastructure/logging/telemetry-logger';
import './infrastructure/tracing/trace-storage';

if (process.argv.includes('shell')) {
  process.env.CLI_SHELL = 'true';
}

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    logger: new TelemetryLogger(),
  });
}
void bootstrap();
