import {
  executeCommandDetailed,
  RetryOptions,
  CommandResult,
  describeFailure,
} from './commandExecutor.js';
import { Logger } from './logger.js';
import { CLI } from '../constants.js';
import { CodexCommandBuilder } from './codexCommandBuilder.js';

// Type-safe enums
/**
 * Extended result from Codex execution with stderr for conversation ID parsing
 */
export interface CodexExecutionResult {
  output: string; // stdout - main response
  stderr: string; // stderr - may contain conversation ID
}

export enum ApprovalPolicy {
  Never = 'never',
  OnRequest = 'on-request',
}

export enum SandboxMode {
  ReadOnly = 'read-only',
  WorkspaceWrite = 'workspace-write',
  DangerFullAccess = 'danger-full-access',
}

export interface CodexExecOptions {
  readonly model?: string;
  readonly fullAuto?: boolean;
  readonly approvalPolicy?: ApprovalPolicy;
  readonly sandboxMode?: SandboxMode;
  readonly approval?: string;
  readonly yolo?: boolean;
  readonly cd?: string;
  readonly workingDir?: string;
  readonly timeoutMs?: number;
  readonly timeout?: number;
  readonly maxOutputBytes?: number;
  readonly retry?: RetryOptions;
  readonly useStdinForLongPrompts?: boolean; // Use stdin for prompts > 100KB
  readonly image?: string | string[];
  readonly config?: string | Record<string, any>;
  readonly profile?: string;
  readonly useExec?: boolean;
  readonly search?: boolean; // Enable web search
  readonly oss?: boolean; // Use local Ollama server
  readonly localProvider?: 'lmstudio' | 'ollama'; // Specify local provider
  readonly enableFeatures?: string[]; // Enable feature flags
  readonly disableFeatures?: string[]; // Disable feature flags
  // New parameters (v1.3.0+)
  readonly addDirs?: string[]; // Additional writable directories
  readonly toolOutputTokenLimit?: number; // Max tokens for tool outputs (100-10,000)
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
  // Session/Resume support (v1.4.0+)
  readonly codexConversationId?: string; // Native Codex conversation ID for resume
  // Change mode support
  readonly changeMode?: boolean; // Prepend format instructions for structured OLD/NEW edits
  // New parameters (v2.0.0)
  readonly outputSchema?: string | Record<string, any>; // JSON Schema path or inline schema
  readonly personality?: 'pragmatic' | 'friendly' | 'none'; // Communication style
  readonly skipGitRepoCheck?: boolean; // Skip git repo validation
  readonly outputLastMessage?: string; // Write final message to file path
  readonly strictConfig?: boolean; // Fail on unknown config.toml fields
  readonly ephemeral?: boolean; // Do not persist session files
  readonly ignoreUserConfig?: boolean; // Ignore $CODEX_HOME/config.toml
  readonly ignoreRules?: boolean; // Ignore user/project execpolicy rules
  readonly bypassHookTrust?: boolean; // Dangerous: bypass persisted hook trust
}

const DEFAULT_CODEX_TIMEOUT_MS = 600000;

/**
 * Pull the actual error out of Codex's stderr.
 *
 * stderr carries the whole run transcript — a banner with `sandbox: read-only`
 * and `session id: <uuid>`, config warnings, often the prompt itself — so
 * matching keywords against all of it misclassifies errors (an unknown model
 * came back as "Permission denied" because of the banner). Codex prefixes real
 * failures with `ERROR:`; fall back to the last few lines otherwise.
 */
export function extractCodexDiagnostic(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map(line => line.trim());
  const errorLines = [...new Set(lines.filter(line => /^error\b:?/i.test(line)))];
  if (errorLines.length) return errorLines.join('\n');
  // Without ERROR: lines, use the tail minus the run banner, whose
  // `sandbox:` / `session id:` lines would mislead classification.
  const banner =
    /^(?:openai codex v|-{4,}$|workdir:|model:|provider:|approval:|sandbox:|reasoning effort:|reasoning summaries:|session id:)/i;
  const tail = lines
    .filter(line => line && !banner.test(line))
    .slice(-15)
    .join('\n');
  return tail || 'Unknown error';
}

/**
 * Build the error for a failed Codex run. Pre-flight diagnostics (unresolved
 * binary, bad working directory) are already specific, so they pass verbatim.
 */
function codexFailure(result: CommandResult, timeoutMs: number): Error {
  const stderr = result.stderr || '';
  if (stderr.startsWith("'codex' was not found") || stderr.startsWith('Working directory')) {
    return new Error(stderr);
  }
  if (result.aborted || result.timedOut || result.outputExceeded) {
    return new Error(describeFailure(result, timeoutMs).replace(/^Command/, 'Codex CLI'));
  }
  return new Error(
    `Codex CLI failed with exit code ${result.code}: ${extractCodexDiagnostic(stderr)}`
  );
}

/**
 * Execute Codex CLI with enhanced error handling and memory efficiency
 */
export async function executeCodexCLI(
  prompt: string,
  options?: CodexExecOptions,
  onProgress?: (newOutput: string) => void
): Promise<string> {
  const builder = new CodexCommandBuilder();
  const { args, tempFiles, workingDir, stdinInput } = await builder.build(prompt, {
    ...options,
    concisePrompt: true,
    useStdinForLongPrompts: options?.useStdinForLongPrompts !== false,
  });

  try {
    const timeoutMs = options?.timeoutMs || options?.timeout || DEFAULT_CODEX_TIMEOUT_MS;
    const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, args, {
      onProgress,
      timeoutMs,
      maxOutputBytes: options?.maxOutputBytes,
      retry: options?.retry,
      cwd: workingDir,
      stdinInput,
    });

    // A run we stopped (timeout, overflow, cancel) is an error even when it
    // produced a lot of output: returning the partial transcript as the answer
    // is the timeout-as-success bug in another form.
    if (!result.ok) {
      throw codexFailure(result, timeoutMs);
    }

    return result.stdout;
  } catch (error) {
    Logger.error('Codex CLI execution failed:', error);
    throw error;
  } finally {
    // Clean up temp files
    for (const tf of tempFiles) {
      CodexCommandBuilder.cleanupTempFile(tf);
    }
  }
}

/**
 * High-level executeCodex function with comprehensive options support
 * Returns both stdout and stderr for conversation ID parsing
 */
export async function executeCodex(
  prompt: string,
  options?: CodexExecOptions & { [key: string]: any },
  onProgress?: (newOutput: string) => void
): Promise<CodexExecutionResult> {
  const builder = new CodexCommandBuilder();
  const { args, tempFiles, workingDir, stdinInput } = await builder.build(prompt, {
    ...options,
    concisePrompt: false,
    // Oversized prompts go over stdin here too; passing them on argv risks E2BIG.
    useStdinForLongPrompts: options?.useStdinForLongPrompts !== false,
  });

  try {
    const timeoutMs = options?.timeout || options?.timeoutMs || DEFAULT_CODEX_TIMEOUT_MS;

    const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, args, {
      onProgress,
      timeoutMs,
      maxOutputBytes: options?.maxOutputBytes,
      retry: options?.retry,
      cwd: workingDir,
      stdinInput,
    });

    if (!result.ok) {
      // Classification (auth, rate limit, model, sandbox…) happens in
      // errorTypes.classifyError on this message, which now holds only the
      // real error lines instead of the whole transcript.
      throw codexFailure(result, timeoutMs);
    }

    // Return both stdout and stderr for conversation ID parsing
    return {
      output: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    Logger.error('Codex execution failed:', error);
    throw error;
  } finally {
    // Clean up temp files
    for (const tf of tempFiles) {
      CodexCommandBuilder.cleanupTempFile(tf);
    }
  }
}
