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

export interface CommandResult {
  ok: boolean;
  code: number | null;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
  timedOut: boolean;
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
    timeoutMs = 600000,
    maxOutputBytes = 50 * 1024 * 1024, // 50MB default
    retry,
    cwd,
    stdinInput,
  } = options;

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
    attempt++;
    const result = await executeOnce(resolution, args, {
      onProgress,
      timeoutMs,
      maxOutputBytes,
      cwd,
      stdinInput,
    });

    if (result.ok) {
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
  { onProgress, timeoutMs, maxOutputBytes, cwd, stdinInput }: Omit<ExecuteOptions, 'retry'>
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
    const stderrChunks: Buffer[] = [];
    let totalStdoutBytes = 0;
    let isResolved = false;
    let outputExceeded = false;
    // Tracks whether *we* killed the child for running too long. A child that
    // catches SIGTERM and exits(0) on its own (Codex CLI does this) reports
    // `signal: null, code: 0` to the 'close' handler — indistinguishable from
    // a clean finish unless we remember the kill ourselves.
    let killedByTimeout = false;

    // Set up timeout with SIGKILL fallback
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        killedByTimeout = true;
        childProcess.kill('SIGTERM');
        Logger.warn(`Process timeout after ${timeoutMs}ms, sending SIGTERM`);

        // Give process 5 seconds to terminate gracefully
        setTimeout(() => {
          if (!isResolved) {
            childProcess.kill('SIGKILL');
            Logger.error(`Process did not terminate, sending SIGKILL`);
          }
        }, 5000);
      }
    }, timeoutMs || 600000);

    childProcess.stdout?.on('data', (data: Buffer) => {
      // Check output size limit
      if (maxOutputBytes && totalStdoutBytes + data.length > maxOutputBytes) {
        if (!outputExceeded) {
          outputExceeded = true;
          Logger.warn(`Output exceeded ${maxOutputBytes} bytes, stopping collection`);
          childProcess.kill('SIGTERM');
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

    // Capture stderr for error reporting
    childProcess.stderr?.on('data', (data: Buffer) => {
      stderrChunks.push(data);
    });
    childProcess.on('error', error => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
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
    childProcess.on('close', (code, signal) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        const timedOut = killedByTimeout || signal === 'SIGTERM' || signal === 'SIGKILL';

        Logger.commandComplete(startTime, code, stdout.length);

        resolve({
          ok: code === 0 && !outputExceeded && !timedOut,
          code,
          signal: signal || undefined,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          partialStdout: timedOut || outputExceeded ? stdout : undefined,
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
  timeoutMs: number = 600000
): Promise<string> {
  const result = await executeCommandDetailed(command, args, {
    onProgress,
    timeoutMs,
  });

  if (!result.ok) {
    const errorMessage = result.stderr || 'Unknown error';
    throw new Error(
      result.timedOut
        ? `Command timed out after ${timeoutMs}ms`
        : `Command failed with exit code ${result.code}: ${errorMessage}`
    );
  }

  return result.stdout;
}
