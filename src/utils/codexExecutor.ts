import { executeCommandDetailed, RetryOptions } from './commandExecutor.js';
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
  OnFailure = 'on-failure',
  Untrusted = 'untrusted',
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
  readonly enableFeatures?: string[]; // Enable feature flags
  readonly disableFeatures?: string[]; // Disable feature flags
  // New parameters (v1.3.0+)
  readonly addDirs?: string[]; // Additional writable directories
  readonly toolOutputTokenLimit?: number; // Max tokens for tool outputs (100-10,000)
  // Session/Resume support (v1.4.0+)
  readonly codexConversationId?: string; // Native Codex conversation ID for resume
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
  const { args, tempFile } = await builder.build(prompt, {
    ...options,
    concisePrompt: true,
    useStdinForLongPrompts: options?.useStdinForLongPrompts !== false,
  });

  try {
    // Use detailed execution for better error handling
    const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, args, {
      onProgress,
      timeoutMs: options?.timeoutMs,
      maxOutputBytes: options?.maxOutputBytes,
      retry: options?.retry,
    });

    if (!result.ok) {
      // Try to salvage partial output if available
      if (result.partialStdout && result.partialStdout.length > 1000) {
        Logger.warn('Command failed but partial output available, attempting to use it');
        return result.partialStdout;
      }

      const errorMessage = result.stderr || 'Unknown error';
      throw new Error(
        result.timedOut
          ? `Codex CLI timed out after ${options?.timeoutMs || 600000}ms`
          : `Codex CLI failed with exit code ${result.code}: ${errorMessage}`
      );
    }

    return result.stdout;
  } catch (error) {
    Logger.error('Codex CLI execution failed:', error);
    throw error;
  } finally {
    // Clean up temp file
    if (tempFile) {
      CodexCommandBuilder.cleanupTempFile(tempFile);
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
  const { args } = await builder.build(prompt, {
    ...options,
    concisePrompt: false,
    useStdinForLongPrompts: false,
  });

  try {
    const timeoutMs = options?.timeout || options?.timeoutMs || 600000; // 10 minutes default

    const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, args, {
      onProgress,
      timeoutMs,
      maxOutputBytes: options?.maxOutputBytes,
      retry: options?.retry,
    });

    if (!result.ok) {
      // Enhanced error handling with specific messages
      const errorMessage = result.stderr || 'Unknown error';

      if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
        throw new Error('Codex CLI not found. Install with: npm install -g @openai/codex');
      }

      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        throw new Error('Authentication failed. Run "codex login" or set OPENAI_API_KEY');
      }

      if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
        throw new Error('Rate limit exceeded. Please wait and try again');
      }

      if (errorMessage.includes('permission') || errorMessage.includes('sandbox')) {
        throw new Error(
          `Permission denied. Try adjusting sandbox mode or approval policy: ${errorMessage}`
        );
      }

      throw new Error(`Codex CLI failed: ${errorMessage}`);
    }

    // Return both stdout and stderr for conversation ID parsing
    return {
      output: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    Logger.error('Codex execution failed:', error);
    throw error;
  }
}
