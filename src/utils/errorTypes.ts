/**
 * Structured Error Types for Codex MCP Tool
 * Provides typed error handling with 11 categories for better debugging and user feedback
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  CLI_NOT_FOUND = 'CLI_NOT_FOUND',
  AUTHENTICATION = 'AUTHENTICATION',
  MODEL = 'MODEL',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  SANDBOX = 'SANDBOX',
  NETWORK = 'NETWORK',
  SESSION = 'SESSION',
  CANCELLED = 'CANCELLED',
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',
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
  [ErrorCategory.MODEL]: {
    title: 'Model Error',
    description: 'The requested model is unavailable or not supported.',
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
  [ErrorCategory.CANCELLED]: {
    title: 'Request Cancelled',
    description: 'The client cancelled the request; the Codex process was stopped.',
  },
  [ErrorCategory.INVALID_ARGUMENTS]: {
    title: 'Invalid Arguments',
    description: 'The request has an invalid or conflicting argument; Codex was not started.',
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
  [ErrorCategory.MODEL]: [
    'Omit the model parameter to use the default model',
    'Check available models in your OpenAI account',
    'Verify your subscription supports the requested model',
    'Try a different model: gpt-6-sol, gpt-6-luna, gpt-5.6-sol',
    'Newer models such as gpt-6.1-sol need a recent CLI: `npm install -g @openai/codex@latest`',
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
  [ErrorCategory.CANCELLED]: ['Re-run the request if the cancel was not intended'],
  [ErrorCategory.INVALID_ARGUMENTS]: [
    'Fix or remove the argument named in the message and retry',
    "Check the tool's input schema for allowed values and combinations",
  ],
  [ErrorCategory.UNKNOWN]: [
    'Check Codex CLI: `codex --version`',
    'Run `codex login` to verify authentication',
    'Try simpler query to isolate the issue',
    'Use `health` tool to diagnose',
  ],
};

/**
 * A request rejected by our own validation, before Codex is spawned.
 *
 * Thrown instead of a plain Error so it is categorised by type: matching the
 * wording would break whenever a message is reworded, and without it these
 * fell into UNKNOWN, whose advice ("run codex login") sends the caller after
 * the wrong cause.
 */
export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}

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
  // Codex prefixes every failure with "ERROR:", which would satisfy the loose
  // "error … model" pattern below for any message that mentions a model.
  const message = errorMessage.toLowerCase().replace(/\berror:\s*/g, '');

  // Precise causes first. The loose model pattern used to run first, so
  // "rate limit reached for model X" became a Model Error.
  if (message.includes('request cancelled') || message.includes('request canceled')) {
    return ErrorCategory.CANCELLED;
  }

  // Model errors with unambiguous wording.
  if (
    message.includes('model not found') ||
    message.includes('model_not_found') ||
    message.includes('does not have access to model') ||
    message.includes('invalid model') ||
    message.includes('unsupported model') ||
    message.includes('model is not available') ||
    message.includes('model not available') ||
    message.includes('not supported for this model') ||
    /\bmodel\b.{0,80}\bis not supported\b/.test(message)
  ) {
    return ErrorCategory.MODEL;
  }

  // CLI not found — use specific phrases to avoid matching "model not found" etc.
  if (
    message.includes('command not found') ||
    message.includes('codex: not found') ||
    message.includes('codex not found') ||
    message.includes("'codex' was not found") ||
    message.includes('enoent')
  ) {
    return ErrorCategory.CLI_NOT_FOUND;
  }

  // Authentication (401 only as a whole number — it used to match inside
  // session UUIDs).
  if (
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('not logged in') ||
    message.includes('api key') ||
    /(?<![\w-])401(?![\w-])/.test(message)
  ) {
    return ErrorCategory.AUTHENTICATION;
  }

  // Rate limiting
  if (
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('usage limit') ||
    /(?<![\w-])429(?![\w-])/.test(message)
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

  // Sandbox/Permission — specific phrases only (the stderr banner always
  // contains "sandbox: …").
  if (
    message.includes('sandbox violation') ||
    message.includes('sandbox restriction') ||
    message.includes('sandbox blocked') ||
    message.includes('sandbox error') ||
    message.includes('permission denied') ||
    message.includes('access denied') ||
    message.includes('operation not permitted')
  ) {
    return ErrorCategory.SANDBOX;
  }

  // Loose model wording, after every precise cause.
  if (
    message.includes('does not exist') ||
    /\bmodel\b.{0,50}\b(?:fail|failed|reject|rejected|unavailable|unknown)\b/.test(message) ||
    /\b(?:fail|failed|reject|rejected|unavailable|unknown)\b.{0,50}\bmodel\b/.test(message)
  ) {
    return ErrorCategory.MODEL;
  }

  // Network — concrete failure phrases, not any mention of "connect".
  if (
    message.includes('network error') ||
    message.includes('network is unreachable') ||
    message.includes('connection refused') ||
    message.includes('connection reset') ||
    message.includes('failed to connect') ||
    message.includes('could not connect') ||
    message.includes('error sending request') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  ) {
    return ErrorCategory.NETWORK;
  }

  // Session — concrete phrases, not any mention of "session" or "expired".
  if (
    message.includes('session not found') ||
    message.includes('no session') ||
    message.includes('session expired') ||
    message.includes('conversation not found') ||
    message.includes('thread not found') ||
    message.includes('no rollout found') ||
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
  const category =
    error instanceof InvalidArgumentError
      ? ErrorCategory.INVALID_ARGUMENTS
      : classifyError(message);
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
    [ErrorCategory.MODEL]: 0,
    [ErrorCategory.SANDBOX]: 0,
    [ErrorCategory.SESSION]: 0,
    [ErrorCategory.CANCELLED]: 0,
    [ErrorCategory.INVALID_ARGUMENTS]: 0,
    [ErrorCategory.UNKNOWN]: 5000,
  };

  const baseDelay = baseDelays[category];
  // Exponential backoff with jitter
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000;

  return Math.min(delay + jitter, 300000); // Max 5 minutes
}
