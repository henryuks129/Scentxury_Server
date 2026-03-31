/**
 * ============================================
 * WINSTON LOGGER
 * ============================================
 *
 * Centralized logging utility using Winston.
 * Outputs structured JSON in production, colorized in development.
 *
 * @file src/utils/logger.ts
 */

import { createLogger, format, transports, Logger } from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = format;

const NODE_ENV = process.env.NODE_ENV || 'development';

// Development format: colorized, human-readable
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    let log = `[${ts}] ${level}: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Production format: structured JSON
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger: Logger = createLogger({
  level: NODE_ENV === 'production' ? 'warn' : 'debug',
  format: NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new transports.Console({
      silent: NODE_ENV === 'test',
    }),
  ],
  exitOnError: false,
});

// Convenience methods
export const logInfo = (message: string, meta?: Record<string, unknown>) =>
  logger.info(message, meta);

export const logError = (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => {
  if (error instanceof Error) {
    logger.error(message, { ...meta, error: error.message, stack: error.stack });
  } else {
    logger.error(message, { ...meta, error });
  }
};

export const logWarn = (message: string, meta?: Record<string, unknown>) =>
  logger.warn(message, meta);

export const logDebug = (message: string, meta?: Record<string, unknown>) =>
  logger.debug(message, meta);

export default logger;
