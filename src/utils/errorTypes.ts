/**
 * Structured Error Types for Codex MCP Tool
 * Provides typed error handling with 8 categories for better debugging and user feedback
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  CLI_NOT_FOUND = 'CLI_NOT_FOUND',
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  SANDBOX = 'SANDBOX',
  NETWORK = 'NETWORK',
  SESSION = 'SESSION',
  UNKNOWN = 'UNKNOWN',
}

/**
 * User-friendly error messages by category
 */
export const ERROR_MESSAGES: Record<ErrorCategory, { title: string; description: string }> = {
  [ErrorCategory.CLI_NOT_FOUND]: {
    title: 'Codex CLI Not Found',
    description: 'Codex CLI is not installed or not in PATH.',
  },
  [ErrorCategory.AUTHENTICATION]: {
    title: 'Authentication Failed',
    description: 'API key is invalid or authentication is required.',
  },
  [ErrorCategory.RATE_LIMIT]: {
    title: 'Rate Limit Exceeded',
    description: 'Too many requests. Please wait and try again.',
  },
  [ErrorCategory.TIMEOUT]: {
    title: 'Request Timeout',
    description: 'Operation took longer than expected.',
  },
  [ErrorCategory.SANDBOX]: {
    title: 'Sandbox Permission Error',
    description: 'Operation blocked by sandbox restrictions.',
  },
  [ErrorCategory.NETWORK]: {
    title: 'Network Error',
    description: 'Failed to connect to API server.',
  },
  [ErrorCategory.SESSION]: {
    title: 'Session Error',
    description: 'Session is invalid, expired, or not found.',
  },
  [ErrorCategory.UNKNOWN]: {
    title: 'Unknown Error',
    description: 'An unexpected error occurred.',
  },
};

/**
 * Solutions/suggestions by error category
 */
export const ERROR_SOLUTIONS: Record<ErrorCategory, string[]> = {
  [ErrorCategory.CLI_NOT_FOUND]: [
    'Install Codex CLI: `npm install -g @openai/codex`',
    'Verify installation: `codex --version`',
    'Check PATH environment variable',
  ],
  [ErrorCategory.AUTHENTICATION]: [
    'Run `codex login` to authenticate',
    'Set `OPENAI_API_KEY` environment variable',
    'Verify API key has Codex access in OpenAI dashboard',
  ],
  [ErrorCategory.RATE_LIMIT]: [
    'Wait a few minutes before retrying',
    'Check usage quotas in OpenAI dashboard',
    'Consider using a less powerful model',
  ],
  [ErrorCategory.TIMEOUT]: [
    'Increase timeout: `timeout: 300000` (5 minutes)',
    'Simplify request or break into smaller parts',
    'Check network connectivity',
  ],
  [ErrorCategory.SANDBOX]: [
    'Use `sandboxMode: "workspace-write"` for file operations',
    'Use `approval: "on-request"` for interactive approval',
    'Use `fullAuto: true` for automated operations',
  ],
  [ErrorCategory.NETWORK]: [
    'Check internet connection',
    'Verify firewall/proxy settings',
    'Try again later - API may be experiencing issues',
  ],
  [ErrorCategory.SESSION]: [
    'Session may have expired (default TTL: 24 hours)',
    'Use `list-sessions` to check active sessions',
    'Create new session by omitting `sessionId`',
    'Use `resetSession: true` to start fresh',
  ],
  [ErrorCategory.UNKNOWN]: [
    'Check Codex CLI: `codex --version`',
    'Run `codex login` to verify authentication',
    'Try simpler query to isolate the issue',
    'Use `health` tool to diagnose',
  ],
};

/**
 * Custom error class with category and structured data
 */
export class CodexError extends Error {
  public readonly category: ErrorCategory;
  public readonly originalError?: Error;
  public readonly context?: Record<string, unknown>;

  constructor(
    category: ErrorCategory,
    message?: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    const errorInfo = ERROR_MESSAGES[category];
    super(message || errorInfo.description);
    this.name = 'CodexError';
    this.category = category;
    this.originalError = originalError;
    this.context = context;
  }

  /**
   * Get user-friendly error title
   */
  get title(): string {
    return ERROR_MESSAGES[this.category].title;
  }

  /**
   * Get solutions/suggestions for this error
   */
  get solutions(): string[] {
    return ERROR_SOLUTIONS[this.category];
  }

  /**
   * Format error for display
   */
  toUserFriendlyString(): string {
    const lines: string[] = [];
    lines.push(`**${this.title}**: ${this.message}`);
    lines.push('');
    lines.push('**Solutions:**');
    for (const solution of this.solutions) {
      lines.push(`- ${solution}`);
    }
    return lines.join('\n');
  }

  /**
   * Format as markdown
   */
  toMarkdown(): string {
    const emoji = this.category === ErrorCategory.UNKNOWN ? '?' : '';
    let output = `## ${emoji} ${this.title}\n\n`;
    output += `${this.message}\n\n`;
    output += `### Recommended Actions\n\n`;
    for (const solution of this.solutions) {
      output += `- ${solution}\n`;
    }
    if (this.context) {
      output += `\n### Context\n\n`;
      output += '```json\n';
      output += JSON.stringify(this.context, null, 2);
      output += '\n```\n';
    }
    return output;
  }
}

/**
 * Classify error message into category
 */
export function classifyError(errorMessage: string): ErrorCategory {
  const message = errorMessage.toLowerCase();

  // CLI not found
  if (
    message.includes('command not found') ||
    message.includes('not found') ||
    message.includes('enoent')
  ) {
    return ErrorCategory.CLI_NOT_FOUND;
  }

  // Authentication
  if (
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('api key') ||
    message.includes('401')
  ) {
    return ErrorCategory.AUTHENTICATION;
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return ErrorCategory.RATE_LIMIT;
  }

  // Timeout
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout')
  ) {
    return ErrorCategory.TIMEOUT;
  }

  // Sandbox/Permission
  if (
    message.includes('sandbox') ||
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('access')
  ) {
    return ErrorCategory.SANDBOX;
  }

  // Network
  if (
    message.includes('network') ||
    message.includes('connect') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  ) {
    return ErrorCategory.NETWORK;
  }

  // Session
  if (
    message.includes('session') ||
    message.includes('expired') ||
    message.includes('conversation id')
  ) {
    return ErrorCategory.SESSION;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Create CodexError from generic error
 */
export function createCodexError(
  error: Error | string,
  context?: Record<string, unknown>
): CodexError {
  const message = error instanceof Error ? error.message : error;
  const category = classifyError(message);
  const originalError = error instanceof Error ? error : undefined;

  return new CodexError(category, message, originalError, context);
}

/**
 * Format any error for user-friendly display
 */
export function formatErrorForUser(error: Error | string | CodexError): string {
  if (error instanceof CodexError) {
    return error.toUserFriendlyString();
  }

  const codexError = createCodexError(error);
  return codexError.toUserFriendlyString();
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: CodexError | ErrorCategory): boolean {
  const category = error instanceof CodexError ? error.category : error;

  const retryableCategories = [
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.TIMEOUT,
    ErrorCategory.NETWORK,
  ];

  return retryableCategories.includes(category);
}

/**
 * Get retry delay based on error category (in milliseconds)
 */
export function getRetryDelay(error: CodexError | ErrorCategory, attempt: number = 1): number {
  const category = error instanceof CodexError ? error.category : error;
  const baseDelays: Record<ErrorCategory, number> = {
    [ErrorCategory.RATE_LIMIT]: 60000, // 1 minute
    [ErrorCategory.TIMEOUT]: 5000, // 5 seconds
    [ErrorCategory.NETWORK]: 10000, // 10 seconds
    [ErrorCategory.CLI_NOT_FOUND]: 0,
    [ErrorCategory.AUTHENTICATION]: 0,
    [ErrorCategory.SANDBOX]: 0,
    [ErrorCategory.SESSION]: 0,
    [ErrorCategory.UNKNOWN]: 5000,
  };

  const baseDelay = baseDelays[category];
  // Exponential backoff with jitter
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000;

  return Math.min(delay + jitter, 300000); // Max 5 minutes
}
