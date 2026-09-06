// Logging
export const LOG_PREFIX = '[CODEX-MCP]';

// Error messages
export const ERROR_MESSAGES = {
  TOOL_NOT_FOUND: 'not found in registry',
  NO_PROMPT_PROVIDED:
    "Please provide a prompt for analysis. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions",
  QUOTA_EXCEEDED: 'Rate limit exceeded',
  AUTHENTICATION_FAILED: 'Authentication failed - please check your OpenAI API key or login status',
  CODEX_NOT_FOUND: "Codex CLI not found - please install with 'npm install -g @openai/codex'",
  SANDBOX_VIOLATION: 'Operation blocked by sandbox policy',
  UNSAFE_COMMAND: 'Command requires approval or elevated permissions',
} as const;

// Status messages
export const STATUS_MESSAGES = {
  SANDBOX_EXECUTING: '🔒 Executing CLI command in sandbox/auto mode...',
  CODEX_RESPONSE: 'Codex response:',
  AUTHENTICATION_SUCCESS: '✅ Authentication successful',
  // Timeout prevention messages
  PROCESSING_START: '🔍 Starting analysis (may take 5-15 minutes for large codebases)',
  PROCESSING_CONTINUE: '⏳ Still processing...',
  PROCESSING_COMPLETE: '✅ Analysis completed successfully',
} as const;

// Current Codex CLI models — synced with `$CODEX_HOME/models_cache.json` @ client_version 0.153.4.
// Only models with `visibility: "list"` are exposed; `gpt-reserve` and `codex-auto-review` are
// internal (`visibility: "hide"`) and deliberately omitted.
// Note: the bare moving aliases `gpt-6` and `gpt-5.6` are NOT accepted — the API rejects them with
// a 400, so every entry here is a concrete slug.
export const MODELS = {
  GPT6_ASTRA: 'gpt-6-astra', // Most capable model for complex, demanding work
  GPT5_6_SOL: 'gpt-5.6-sol', // Reliable agentic workhorse for everyday tasks
  GPT5_6_TERRA: 'gpt-5.6-terra', // Balanced agentic coding model for everyday work
  GPT5_6_LUNA: 'gpt-5.6-luna', // Fast, affordable agentic coding model
  GPT5_5: 'gpt-5.5', // Proven previous-generation model for coding and general work
  GPT5_4_MINI: 'gpt-5.4-mini', // Deprecated — Codex steers callers to gpt-5.6-luna
} as const;

// Reasoning levels exposed by the current Codex CLI model picker.
// Availability is model-dependent: max/ultra are GPT-6 / GPT-5.6 options.
export const REASONING_EFFORTS = {
  LOW: 'low', // Fast responses with lighter reasoning
  MEDIUM: 'medium', // Default: Balances speed and reasoning depth
  HIGH: 'high', // Greater reasoning depth for complex problems
  XHIGH: 'xhigh', // Extra high reasoning depth for complex problems
  MAX: 'max', // Maximum single-agent reasoning depth
  ULTRA: 'ultra', // Maximum reasoning with automatic task delegation
} as const;

/**
 * Reasoning levels each known model actually accepts, from
 * `$CODEX_HOME/models_cache.json` (client_version 0.153.4). `max` and `ultra`
 * are not universal: asking for an unsupported level is rejected by the CLI, so
 * it is worth catching before spawning.
 *
 * Models absent from this map are passed through unchecked — Codex CLI remains
 * the authority for names this server does not track.
 */
export const MODEL_REASONING_EFFORTS: Record<string, readonly string[]> = {
  [MODELS.GPT6_ASTRA]: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  [MODELS.GPT5_6_SOL]: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  [MODELS.GPT5_6_TERRA]: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  [MODELS.GPT5_6_LUNA]: ['low', 'medium', 'high', 'xhigh', 'max'],
  [MODELS.GPT5_5]: ['low', 'medium', 'high', 'xhigh'],
  [MODELS.GPT5_4_MINI]: ['low', 'medium', 'high', 'xhigh'],
};

// Personality modes (Codex CLI v0.94.0+)
export const PERSONALITIES = {
  PRAGMATIC: 'pragmatic',
  FRIENDLY: 'friendly',
} as const;

// Sandbox modes
export const SANDBOX_MODES = {
  READ_ONLY: 'read-only',
  WORKSPACE_WRITE: 'workspace-write',
  DANGER_FULL_ACCESS: 'danger-full-access',
} as const;

// Approval policies
// Codex CLI 0.153.x accepts only these two values for `-a/--ask-for-approval`.
// `untrusted` was removed upstream and now fails clap parsing with exit code 2.
export const APPROVAL_POLICIES = {
  ON_REQUEST: 'on-request',
  NEVER: 'never',
} as const;

// MCP Protocol Constants
export const PROTOCOL = {
  // Message roles
  ROLES: {
    USER: 'user',
    ASSISTANT: 'assistant',
  },
  // Content types
  CONTENT_TYPES: {
    TEXT: 'text',
  },
  // Status codes
  STATUS: {
    SUCCESS: 'success',
    ERROR: 'error',
    FAILED: 'failed',
    REPORT: 'report',
  },
  // Notification methods
  NOTIFICATIONS: {
    PROGRESS: 'notifications/progress',
  },
  // Timeout prevention
  KEEPALIVE_INTERVAL: 25000, // 25 seconds
} as const;

// CLI Constants
export const CLI = {
  // Command names
  COMMANDS: {
    CODEX: 'codex',
    CODEX_EXEC: 'codex exec',
    ECHO: 'echo',
  },
  // Command flags
  FLAGS: {
    MODEL: '-m',
    SANDBOX: '-s',
    ASK_FOR_APPROVAL: '--ask-for-approval',
    SANDBOX_MODE: '--sandbox',
    APPROVAL: '-a',
    YOLO: '--dangerously-bypass-approvals-and-sandbox',
    BYPASS_HOOK_TRUST: '--dangerously-bypass-hook-trust',
    CD: '--cd',
    PROMPT: '-p',
    HELP: '--help',
    IMAGE: '-i',
    PROFILE: '--profile',
    CONFIG: '-c',
    VERSION: '--version',
    WORKING_DIR: '-C',
    OSS: '--oss',
    LOCAL_PROVIDER: '--local-provider', // Specify local provider: lmstudio or ollama
    ENABLE: '--enable',
    DISABLE: '--disable',
    STRICT_CONFIG: '--strict-config',
    // New flags (v1.3.0+)
    SEARCH: '--search', // Native web search flag (Codex CLI v0.52.0+)
    ADD_DIR: '--add-dir', // Additional writable directories (Codex CLI v0.59.0+)
    // Session/Resume flags (v1.4.0+)
    RESUME: 'resume', // Resume command (replaces 'exec' when resuming)
    // New flags (v2.0.0)
    SKIP_GIT_REPO_CHECK: '--skip-git-repo-check', // Skip git repo check (Codex CLI v0.75.0+)
    OUTPUT_SCHEMA: '--output-schema', // JSON Schema constraint (Codex CLI v0.95.0+)
    OUTPUT_LAST_MESSAGE: '-o', // Write final message to file (Codex CLI v0.95.0+)
    EPHEMERAL: '--ephemeral',
    IGNORE_USER_CONFIG: '--ignore-user-config',
    IGNORE_RULES: '--ignore-rules',
  },
  // Default values
  DEFAULTS: {
    MODEL: 'default', // Fallback model used when no specific model is provided
    BOOLEAN_TRUE: 'true',
    BOOLEAN_FALSE: 'false',
  },
  // Environment variables for working directory resolution
  ENV_VARS: {
    CODEX_MCP_CWD: 'CODEX_MCP_CWD', // Primary: Set in MCP client configuration
    PWD: 'PWD', // Secondary: Standard Unix variable
    INIT_CWD: 'INIT_CWD', // Tertiary: Node.js initial directory
  },
} as const;

// (merged PromptArguments and ToolArguments)
export interface ToolArguments {
  prompt?: string;
  model?: string;
  sandbox?: boolean | string;
  // Codex approvals/sandbox controls
  approvalPolicy?: 'never' | 'on-request';
  approval?: string; // Alternative to approvalPolicy
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  fullAuto?: boolean | string; // compatibility alias for workspace-write + never
  yolo?: boolean | string; // --dangerously-bypass-approvals-and-sandbox
  cd?: string; // --cd path
  workingDir?: string; // Alternative to cd
  changeMode?: boolean | string;
  // Session management (v1.4.0+)
  sessionId?: string; // Session ID for conversation continuity
  resetSession?: boolean; // Clear session context before execution
  chunkIndex?: number | string; // Which chunk to return (1-based)
  chunkCacheKey?: string; // Optional cache key for continuation
  message?: string; // For Ping tool -- Un-used.

  // New parameters from resource implementation
  image?: string | string[]; // Image file path(s) to include
  config?: string | Record<string, any>; // Configuration overrides
  profile?: string; // Configuration profile
  timeout?: number; // Execution timeout
  useExec?: boolean; // Use exec mode for non-interactive execution
  includeThinking?: boolean; // Include reasoning in response
  includeMetadata?: boolean; // Include metadata in response
  search?: boolean; // Enable web search (native web_search tool)
  oss?: boolean; // Use local Ollama server (model_provider=oss)
  localProvider?: 'lmstudio' | 'ollama'; // Specify local provider for OSS mode
  enableFeatures?: string[]; // Enable feature flags
  disableFeatures?: string[]; // Disable feature flags
  // New parameters (v1.3.0+)
  addDirs?: string[]; // Additional writable directories beyond workspace
  toolOutputTokenLimit?: number; // Max tokens for tool outputs (100-10,000)
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

  // New parameters (v2.0.0)
  outputSchema?: string | Record<string, any>; // JSON Schema path or inline schema
  personality?: 'pragmatic' | 'friendly'; // Communication style
  skipGitRepoCheck?: boolean; // Skip git repo validation
  outputLastMessage?: string; // Write final message to file path
  strictConfig?: boolean; // Fail on unknown config.toml fields
  ephemeral?: boolean; // Do not persist session files
  ignoreUserConfig?: boolean; // Ignore $CODEX_HOME/config.toml
  ignoreRules?: boolean; // Ignore user/project execpolicy rules
  bypassHookTrust?: boolean; // Dangerous: run enabled hooks without persisted trust

  // Do-Act tool
  verify?: { command: string; exitCode?: number; timeout?: number };
  maxRetries?: number;
  stopOnFailure?: boolean;

  // Brainstorming tool
  methodology?: string; // Brainstorming framework to use
  domain?: string; // Domain context for specialized brainstorming
  constraints?: string; // Known limitations or requirements
  existingContext?: string; // Background information to build upon
  ideaCount?: number; // Target number of ideas to generate
  includeAnalysis?: boolean; // Include feasibility and impact analysis

  [key: string]: string | boolean | number | string[] | Record<string, any> | undefined; // Allow additional properties
}
