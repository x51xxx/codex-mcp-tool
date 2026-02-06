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

// Models (Available in Codex CLI)
export const MODELS = {
  GPT5_3_CODEX: 'gpt-5.3-codex', // Default: Latest frontier agentic coding model
  GPT5_2_CODEX: 'gpt-5.2-codex', // Frontier agentic coding model
  GPT5_1_CODEX_MAX: 'gpt-5.1-codex-max', // Codex-optimized flagship for deep and fast reasoning
  GPT5_1_CODEX_MINI: 'gpt-5.1-codex-mini', // Optimized for codex. Cheaper, faster, but less capable
  GPT5_2: 'gpt-5.2', // Latest frontier model with improvements across knowledge, reasoning and coding
} as const;

// Reasoning effort levels (Available for gpt-5.3-codex model)
// Note: Codex CLI parser accepts 'none'/'minimal' but OpenAI API rejects them for this model
export const REASONING_EFFORTS = {
  LOW: 'low', // Fast responses with lighter reasoning
  MEDIUM: 'medium', // Default: Balances speed and reasoning depth
  HIGH: 'high', // Greater reasoning depth for complex problems
  XHIGH: 'xhigh', // Extra high reasoning depth for complex problems
} as const;

// Sandbox modes
export const SANDBOX_MODES = {
  READ_ONLY: 'read-only',
  WORKSPACE_WRITE: 'workspace-write',
  DANGER_FULL_ACCESS: 'danger-full-access',
} as const;

// Approval policies
export const APPROVAL_POLICIES = {
  UNTRUSTED: 'untrusted',
  ON_FAILURE: 'on-failure',
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
    SANDBOX: '-s', // legacy flag. For Codex prefer FULL_AUTO or SANDBOX/APPROVAL flags.
    FULL_AUTO: '--full-auto',
    ASK_FOR_APPROVAL: '--ask-for-approval',
    SANDBOX_MODE: '--sandbox',
    APPROVAL: '-a',
    YOLO: '--dangerously-bypass-approvals-and-sandbox',
    CD: '--cd',
    PROMPT: '-p',
    HELP: '-help',
    IMAGE: '-i',
    PROFILE: '--profile',
    CONFIG: '-c',
    VERSION: '--version',
    WORKING_DIR: '-C',
    OSS: '--oss',
    LOCAL_PROVIDER: '--local-provider', // Specify local provider: lmstudio or ollama
    ENABLE: '--enable',
    DISABLE: '--disable',
    // New flags (v1.3.0+)
    SEARCH: '--search', // Native web search flag (Codex CLI v0.52.0+)
    ADD_DIR: '--add-dir', // Additional writable directories (Codex CLI v0.59.0+)
    // Session/Resume flags (v1.4.0+)
    RESUME: 'resume', // Resume command (replaces 'exec' when resuming)
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
  approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  approval?: string; // Alternative to approvalPolicy
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  fullAuto?: boolean | string; // convenience alias for --full-auto
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
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'; // Reasoning depth level

  // Brainstorming tool
  methodology?: string; // Brainstorming framework to use
  domain?: string; // Domain context for specialized brainstorming
  constraints?: string; // Known limitations or requirements
  existingContext?: string; // Background information to build upon
  ideaCount?: number; // Target number of ideas to generate
  includeAnalysis?: boolean; // Include feasibility and impact analysis

  [key: string]: string | boolean | number | string[] | Record<string, any> | undefined; // Allow additional properties
}
