import { config } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatMessage(level: LogLevel, message: string): string {
  const now = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  return `[${now}] ${levelStr} ${message}`;
}

export const logger = {
  debug(message: string): void {
    if (levels[config.logging.level] <= levels.debug) {
      console.debug(formatMessage('debug', message));
    }
  },
  info(message: string): void {
    if (levels[config.logging.level] <= levels.info) {
      console.info(formatMessage('info', message));
    }
  },
  warn(message: string): void {
    if (levels[config.logging.level] <= levels.warn) {
      console.warn(formatMessage('warn', message));
    }
  },
  error(message: string, err?: unknown): void {
    if (levels[config.logging.level] <= levels.error) {
      const errStr = err instanceof Error ? ` | ${err.message}` : err ? ` | ${String(err)}` : '';
      console.error(formatMessage('error', message + errStr));
    }
  },
};
