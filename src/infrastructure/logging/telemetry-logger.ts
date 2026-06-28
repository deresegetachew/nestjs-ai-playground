import { ConsoleLogger, Injectable } from '@nestjs/common';
import { getTraceId, getAgentName } from '../../application/utils/trace-context';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { loadConfig } from '../../config/load-config';

interface ParsedLog {
  messageStr: string;
  messageObj: Record<string, any> | null;
  metadata: Record<string, any>;
  finalContext: string | null;
  traceId: string | null;
}

@Injectable()
export class TelemetryLogger extends ConsoleLogger {
  private readonly logFilePath: string;
  private otelLogger: ReturnType<typeof logs.getLogger>;

  constructor(context: string = '') {
    super(context);
    this.logFilePath = path.join(process.cwd(), 'data', 'logs', 'app.log');

    // TODO: pick this up from config
    let serviceName = 'nestjs-ai-playground';
    try {
      const config = loadConfig();
      serviceName = config.telemetry.serviceName;
    } catch {
      // Safe fallback if config loading fails
    }

    this.otelLogger = logs.getLogger(serviceName);
  }

  private mapSeverity(level: string): SeverityNumber {
    switch (level) {
      case 'DEBUG':
        return SeverityNumber.DEBUG;
      case 'VERBOSE':
        return SeverityNumber.TRACE;
      case 'WARN':
        return SeverityNumber.WARN;
      case 'ERROR':
        return SeverityNumber.ERROR;
      case 'INFO':
      default:
        return SeverityNumber.INFO;
    }
  }

  private parseLogArguments(
    level: string,
    message: any,
    context?: string,
    optionalParams: any[] = [],
  ): ParsedLog {
    const traceId = getTraceId() || null;
    const agentName = getAgentName() || null;
    const strings = optionalParams.filter((p): p is string => typeof p === 'string');
    const objects = optionalParams.filter((p): p is object => typeof p === 'object' && p !== null);

    const hasAgentNameInArgs = objects.some(obj => 'agentName' in obj) || (typeof message === 'object' && message !== null && 'agentName' in message);
    const metadata: Record<string, any> = Object.assign(
      (agentName && !hasAgentNameInArgs) ? { agentName } : {},
      ...objects
    );
    let finalContext = context || this.context || null;

    if (strings.length > 0) {
      if (level === 'ERROR' && !metadata.stack) {
        metadata.stack = strings[0];
        if (strings[1]) {
          finalContext = strings[1];
        }
      } else {
        finalContext = strings[0];
      }
    }

    const isObject = typeof message === 'object' && message !== null;
    const messageObj = isObject ? message : null;
    const messageStr = isObject ? (message.message || JSON.stringify(message)) : String(message);

    return { messageStr, messageObj, metadata, finalContext, traceId };
  }

  private writeToLocalLog(level: string, parsed: ParsedLog): void {
    const structuredLog = {
      timestamp: new Date().toISOString(),
      level,
      traceId: parsed.traceId,
      context: parsed.finalContext,
      ...(parsed.messageObj ? parsed.messageObj : { message: parsed.messageStr }),
      ...parsed.metadata,
    };

    const logLine = JSON.stringify(structuredLog) + '\n';

    if (process.env.CLI_SHELL === 'true') {
      try {
        fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
        fs.appendFileSync(this.logFilePath, logLine, 'utf-8');
      } catch {
        // Fallback silently if logs cannot be written to file
      }
    } else {
      process.stdout.write(logLine);
    }
  }

  private exportToOTel(level: string, parsed: ParsedLog): void {
    try {
      const attributes: Record<string, any> = {
        traceId: parsed.traceId || 'SYSTEM',
        context: parsed.finalContext || 'App',
      };

      const allFields = {
        level,
        ...(parsed.messageObj || { message: parsed.messageStr }),
        ...parsed.metadata,
      };

      for (const [k, v] of Object.entries(allFields)) {
        if (k !== 'message') {
          let strVal = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
          if (strVal.length > 1024) {
            strVal = strVal.substring(0, 1024) + '... [Truncated]';
          }
          attributes[k] = strVal;
        }
      }

      const bodyText = JSON.stringify(allFields);

      this.otelLogger.emit({
        body: bodyText,
        severityNumber: this.mapSeverity(level),
        severityText: level,
        attributes,
      });
    } catch {
      // Fallback silently if OTel provider fails or OTLP collector is unreachable
    }
  }

  private formatStructured(level: string, message: any, context?: string, ...optionalParams: any[]) {
    const parsed = this.parseLogArguments(level, message, context, optionalParams);
    this.writeToLocalLog(level, parsed);
    this.exportToOTel(level, parsed);
  }

  override log(message: any, ...optionalParams: any[]) {
    this.formatStructured('INFO', message, undefined, ...optionalParams);
  }

  override error(message: any, ...optionalParams: any[]) {
    this.formatStructured('ERROR', message, undefined, ...optionalParams);
  }

  override warn(message: any, ...optionalParams: any[]) {
    this.formatStructured('WARN', message, undefined, ...optionalParams);
  }

  override debug(message: any, ...optionalParams: any[]) {
    this.formatStructured('DEBUG', message, undefined, ...optionalParams);
  }

  override verbose(message: any, ...optionalParams: any[]) {
    this.formatStructured('VERBOSE', message, undefined, ...optionalParams);
  }
}
