import type { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { LOG_PREFIX } from '../constants.js';

const LEVEL_ORDER: Record<LoggingLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

/** Longest single argument or value printed in a log line. */
const MAX_LOGGED_ARG_CHARS = 200;

function truncateForLog(value: string, max: number = MAX_LOGGED_ARG_CHARS): string {
  return value.length > max ? `${value.slice(0, max)}… [${value.length} chars]` : value;
}

export class Logger {
  private static currentLevel: LoggingLevel = 'warning';

  static setLevel(level: LoggingLevel): void {
    this.currentLevel = level;
  }

  static getLevel(): LoggingLevel {
    return this.currentLevel;
  }

  private static shouldLog(level: LoggingLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.currentLevel];
  }

  private static formatMessage(level: LoggingLevel, message: string): string {
    return `${LOG_PREFIX} [${level.toUpperCase()}] ${message}`;
  }

  private static emit(level: LoggingLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return;

    // stdout carries the MCP JSON-RPC stream, so every level — debug and info
    // included — must go to stderr. A single stray line on stdout corrupts the
    // protocol for the client.
    console.error(this.formatMessage(level, message), ...args);
  }

  static log(message: string, ...args: any[]): void {
    this.emit('info', message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    this.emit('warning', message, ...args);
  }

  static error(message: string, ...args: any[]): void {
    this.emit('error', message, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    this.emit('debug', message, ...args);
  }

  static toolInvocation(toolName: string, args: any): void {
    if (!this.shouldLog('debug')) return;
    const summary = JSON.stringify(args ?? {}, (_key, value) =>
      typeof value === 'string' ? truncateForLog(value) : value
    );
    this.debug(`Args for tool '${toolName}': ${summary}`);
  }

  static toolParsedArgs(
    prompt: string,
    model?: string,
    sandbox?: boolean,
    changeMode?: boolean
  ): void {
    this.debug(`Parsed prompt: "${truncateForLog(prompt)}"\nchangeMode: ${changeMode || false}`);
  }

  /**
   * Logged at debug only, with long arguments (the prompt) truncated: the
   * default `warning` level reaches the MCP client's log, and prompts often
   * carry source code or secrets.
   */
  static commandExecution(command: string, args: string[], startTime: number): void {
    if (!this.shouldLog('debug')) return;
    this.debug(
      `[${startTime}] Starting: ${command} ${args.map(arg => `"${truncateForLog(arg)}"`).join(' ')}`
    );
  }

  static commandComplete(startTime: number, exitCode: number | null, outputLength?: number): void {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.debug(
      `[${elapsed}s] Process finished with exit code: ${exitCode}` +
        (outputLength !== undefined ? `, ${outputLength} chars of output` : '')
    );
  }

  static codexResponse(response: string, tokensUsed?: number): void {
    this.debug(`Codex response: ${response.substring(0, 200)}...`);
    if (tokensUsed) {
      this.debug(`Tokens used: ${tokensUsed}`);
    }
  }
}
