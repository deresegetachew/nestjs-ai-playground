import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { loadConfig } from '../../config/load-config';

let config;
try {
  config = loadConfig();
} catch {
  // Safe fallback if config loading fails during bootstrap in unconfigured environments
  config = {
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
  };
}

const telemetryConfig = config.telemetry;
const inst = telemetryConfig.instrumentations;

const sdk = new NodeSDK({
  serviceName: telemetryConfig.serviceName,
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: telemetryConfig.otelExporterUrl,
    }),
    {
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    },
  ),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: inst.fs },
      '@opentelemetry/instrumentation-http': { enabled: inst.http },
      '@opentelemetry/instrumentation-express': { enabled: inst.express },
      '@opentelemetry/instrumentation-nestjs-core': { enabled: inst.nest },
    }),
  ],
});

sdk.start();
console.log('📡 OpenTelemetry SDK initialized successfully');
