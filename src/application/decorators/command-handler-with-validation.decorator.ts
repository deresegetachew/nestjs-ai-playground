import { BadRequestException } from '@nestjs/common';
import { CommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';

export function CommandHandlerWithValidation<TCommand, TSchema>(
  command: { new (...args: any[]): TCommand },
  schema?: z.ZodSchema<TSchema>,
) {
  return function (target: Function) {
    // 1. Apply the original NestJS CommandHandler decorator
    CommandHandler(command)(target);

    // 2. If a validation schema is provided, wrap the execute method
    if (schema) {
      const originalExecute = target.prototype.execute;
      if (typeof originalExecute === 'function') {
        target.prototype.execute = async function (cmd: any, ...args: any[]) {
          const result = schema.safeParse(cmd);
          if (!result.success) {
            const messages = result.error.issues
              .map((err) => `${err.path.join('.') || 'payload'}: ${err.message}`)
              .join('; ');
            throw new BadRequestException(`Validation failed: ${messages}`);
          }
          // Pass the validated and parsed/sanitized data to the handler
          return originalExecute.apply(this, [result.data, ...args]);
        };
      }
    }
  };
}
