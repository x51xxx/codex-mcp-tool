import spawn from 'cross-spawn';
import { statSync } from 'fs';
import { Logger } from './logger.js';
import {
  resolveBinary,
  describeUnresolvedBinary,
  childEnvWithAugmentedPath,
  CODEX_PATH_ENV,
  BinaryResolution,
} from './binaryResolver.js';
import { currentAbortSignal } from './requestContext.js';

const DEFAULT_TIMEOUT_MS = 600000;
/** Grace period between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 5000;
/** Only the tail of stderr is kept; Codex streams its whole transcript there. */
const MAX_STDERR_BYTES = 1024 * 1024;

export interface CommandResult {
  ok: boolean;
  code: number | null;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** stdout grew past `maxOutputBytes` and the child was stopped. */
  outputExceeded?: boolean;
  /** The MCP client cancelled the request and the child was stopped. */
  aborted?: boolean;
  partialStdout?: string;
}

export interface RetryOptions {
  attempts: number;
  backoffMs: number;
  retryOn: ('timeout' | 'exit_nonzero' | 'spawn_error')[];
}

export interface ExecuteOptions {
  onProgress?: (newOutput: string) => void;
  timeoutMs?: number;
  maxOutputBytes?: number;
  retry?: RetryOptions;
  cwd?: string;
  /**
   * Written to the child's stdin, which is then closed. When omitted stdin is
   * `'ignore'`, so the child sees an immediate EOF and can never read this
   * process's stdin (the MCP stdio transport).
   */
  stdinInput?: string;
  /**
   * Stops the child when aborted. Defaults to the abort signal of the MCP
   * request being served, so a cancelled tool call never leaves Codex running.
   */
  signal?: AbortSignal;
}

function abortedResult(): CommandResult {
  return {
    ok: false,
    code: null,
    stdout: '',
    stderr: 'Request cancelled by the client',
    timedOut: false,
    aborted: true,
  };
}

/**
 * A nonexistent `cwd` makes spawn fail with an ENOENT whose `path` and
 * `syscall` name the *command*, not the directory — indistinguishable from a
 * missing binary. Checking the directory up front is the only way to report
 * the real cause.
 */
function validateCwd(cwd: string): string | undefined {
  try {
    if (!statSync(cwd).isDirectory()) {
      return `Working directory is not a directory: ${cwd}`;
    }
  } catch {
    return (
      `Working directory does not exist: ${cwd}\n` +
      `Check the 'workingDir' argument and the CODEX_MCP_CWD environment variable ` +
      `in your MCP client configuration.`
    );
  }
  return undefined;
}

/**
 * Execute a command with streaming output and structured error handling
 */
export async function executeCommandDetailed(
  command: string,
  args: string[],
  options: ExecuteOptions = {}
): Promise<CommandResult> {
  const {
    onProgress,
    maxOutputBytes = 50 * 1024 * 1024, // 50MB default
    retry,
    cwd,
    stdinInput,
    signal = currentAbortSignal(),
  } = options;
  // 0, negative or NaN would otherwise mean "kill immediately" (setTimeout
  // clamps to 1ms) — treat anything that is not a positive number as unset.
  const timeoutMs =
    options.timeoutMs !== undefined && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  // Pre-flight checks. Both failures below would otherwise surface as an
  // identical, misleading "command not found" ENOENT — and neither is fixed by
  // retrying, so they short-circuit the retry loop.
  if (cwd) {
    const cwdError = validateCwd(cwd);
    if (cwdError) {
      Logger.error(cwdError);
      return { ok: false, code: null, stdout: '', stderr: cwdError, timedOut: false };
    }
  }

  // The override only applies to the Codex CLI itself; it must not redirect
  // some other command to the codex binary.
  const resolution = resolveBinary(command, command === 'codex' ? CODEX_PATH_ENV : undefined);
  if (!resolution.resolved) {
    const message = describeUnresolvedBinary(command, resolution, CODEX_PATH_ENV);
    Logger.error(message);
    return { ok: false, code: null, stdout: '', stderr: message, timedOut: false };
  }

  let attempt = 0;
  const maxAttempts = retry?.attempts || 1;

  while (attempt < maxAttempts) {
    if (signal?.aborted) {
      return abortedResult();
    }
    attempt++;
    const result = await executeOnce(resolution, args, {
      onProgress,
      timeoutMs,
      maxOutputBytes,
      cwd,
      stdinInput,
      signal,
    });

    if (result.ok || result.aborted) {
      return result;
    }

    const shouldRetry =
      retry &&
      ((result.timedOut && retry.retryOn.includes('timeout')) ||
        (result.code !== 0 && result.code !== null && retry.retryOn.includes('exit_nonzero')) ||
        (result.code === null && !result.signal && retry.retryOn.includes('spawn_error')));

    if (!shouldRetry || attempt >= maxAttempts) {
      return result;
    }

    // Exponential backoff
    const delay = retry.backoffMs * Math.pow(2, attempt - 1);
    Logger.warn(`Retrying command after ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // This should never be reached
  throw new Error('Unexpected retry loop exit');
}

async function executeOnce(
  resolution: BinaryResolution,
  args: string[],
  { onProgress, timeoutMs, maxOutputBytes, cwd, stdinInput, signal }: Omit<ExecuteOptions, 'retry'>
): Promise<CommandResult> {
  return new Promise(resolve => {
    const startTime = Date.now();
    const command = resolution.command;
    Logger.commandExecution(command, args, startTime);

    const childProcess = spawn(command, args, {
      // Resolving the executable is not enough: `codex` is a JS file with a
      // `#!/usr/bin/env node` shebang, so the child re-runs a PATH lookup for
      // `node`. Under a GUI client's minimal PATH that fails with
      // `env: node: No such file or directory` despite a correct codex path.
      env: childEnvWithAugmentedPath(),
      shell: false,
      // stdin is only opened when we have something to write; otherwise the
      // child must never be able to read this process's stdin.
      stdio: [stdinInput !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });

    if (stdinInput !== undefined) {
      const stdin = childProcess.stdin;
      if (stdin) {
        // The child may exit before consuming the whole prompt; EPIPE here is
        // expected and must not crash the server.
        stdin.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EPIPE') {
            Logger.debug('Child closed stdin before the prompt was fully written');
          } else {
            Logger.warn('Failed writing prompt to child stdin:', error);
          }
        });
        stdin.end(stdinInput, 'utf8');
        Logger.debug(`Wrote ${stdinInput.length} chars to child stdin`);
      } else {
        Logger.warn('stdin pipe unavailable; prompt could not be delivered');
      }
    }

    const stdoutChunks: Buffer[] = [];
    let stderrTail = Buffer.alloc(0);
    let totalStdoutBytes = 0;
    let isResolved = false;
    let outputExceeded = false;
    let abortedByClient = false;
    // Tracks whether *we* killed the child for running too long. A child that
    // catches SIGTERM and exits(0) on its own (Codex CLI does this) reports
    // `signal: null, code: 0` to the 'close' handler — indistinguishable from
    // a clean finish unless we remember the kill ourselves.
    let killedByTimeout = false;
    let killTimer: NodeJS.Timeout | undefined;

    // SIGTERM first so Codex can stop its own children, SIGKILL if it lingers.
    const terminate = () => {
      if (killTimer || isResolved) return;
      childProcess.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!isResolved) {
          childProcess.kill('SIGKILL');
          Logger.error(`Process did not terminate, sending SIGKILL`);
        }
      }, KILL_GRACE_MS);
    };

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        killedByTimeout = true;
        Logger.warn(`Process timeout after ${timeoutMs}ms, sending SIGTERM`);
        terminate();
      }
    }, timeoutMs || DEFAULT_TIMEOUT_MS);

    const onAbort = () => {
      if (!isResolved) {
        abortedByClient = true;
        Logger.warn('Request cancelled by the client, stopping the process');
        terminate();
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    childProcess.stdout?.on('data', (data: Buffer) => {
      // Check output size limit
      if (maxOutputBytes && totalStdoutBytes + data.length > maxOutputBytes) {
        if (!outputExceeded) {
          outputExceeded = true;
          Logger.warn(`Output exceeded ${maxOutputBytes} bytes, stopping collection`);
          terminate();
        }
        return;
      }

      stdoutChunks.push(data);
      totalStdoutBytes += data.length;

      // Stream progress without buffering
      if (onProgress) {
        onProgress(data.toString('utf8'));
      }
    });

    // Capture stderr for error reporting — the tail is where errors land.
    childProcess.stderr?.on('data', (data: Buffer) => {
      stderrTail = Buffer.concat([stderrTail, data]);
      if (stderrTail.length > MAX_STDERR_BYTES) {
        stderrTail = stderrTail.subarray(stderrTail.length - MAX_STDERR_BYTES);
      }
    });
    childProcess.on('error', error => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        Logger.error(`Process error:`, error);

        // Check for common errors
        const errorMessage = error.message;
        if ((error as any).code === 'ENOENT') {
          // The executable was verified on disk before spawning, so ENOENT here
          // points at the environment around it — most often a working
          // directory that vanished between validation and spawn, or a broken
          // symlink/interpreter line.
          resolve({
            ok: false,
            code: null,
            stdout: '',
            stderr:
              `Failed to start '${command}' (ENOENT). The executable was found at this path, ` +
              `so the cause is likely the working directory${cwd ? ` (${cwd})` : ''} ` +
              `or a broken symlink/interpreter for the executable.`,
            timedOut: false,
          });
        } else {
          resolve({
            ok: false,
            code: null,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: errorMessage,
            timedOut: false,
          });
        }
      }
    });
    childProcess.on('close', (code, exitSignal) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = stderrTail.toString('utf8');
        // Only our own timer decides "timed out": a SIGTERM we sent for an
        // output overflow or a client cancel is not a timeout, and Codex
        // exits 0 after catching SIGTERM, so the exit signal proves nothing.
        const timedOut = killedByTimeout;
        const interrupted = timedOut || outputExceeded || abortedByClient;

        Logger.commandComplete(startTime, code, stdout.length);

        resolve({
          ok: code === 0 && !interrupted,
          code,
          signal: exitSignal || undefined,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          ...(outputExceeded ? { outputExceeded } : {}),
          ...(abortedByClient ? { aborted: true } : {}),
          partialStdout: interrupted ? stdout : undefined,
        });
      }
    });
  });
}

/**
 * Backward compatible wrapper that returns stdout string
 */
export async function executeCommand(
  command: string,
  args: string[],
  onProgress?: (newOutput: string) => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const result = await executeCommandDetailed(command, args, {
    onProgress,
    timeoutMs,
  });

  if (!result.ok) {
    const errorMessage = result.stderr || 'Unknown error';
    throw new Error(describeFailure(result, timeoutMs, errorMessage));
  }

  return result.stdout;
}

/** One-line reason for a failed run, for callers that turn it into an Error. */
export function describeFailure(
  result: CommandResult,
  timeoutMs: number,
  detail: string = result.stderr || 'Unknown error'
): string {
  if (result.aborted) return 'Request cancelled by the client';
  if (result.timedOut) return `Command timed out after ${timeoutMs}ms`;
  if (result.outputExceeded) return 'Command output exceeded the size limit and was stopped';
  return `Command failed with exit code ${result.code}: ${detail}`;
}
