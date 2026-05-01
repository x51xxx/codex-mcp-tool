import { z } from 'zod';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { executeCodex } from '../utils/codexExecutor.js';
import { executeCommandDetailed } from '../utils/commandExecutor.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { MODELS } from '../constants.js';

const verifySchema = z.object({
  command: z.string().describe('Shell command to verify result (e.g., "npm test", "cargo build")'),
  exitCode: z.number().default(0).describe('Expected exit code. Default: 0'),
  timeout: z.number().default(60000).describe('Verify timeout in ms. Default: 60s'),
});

const doActArgsSchema = z.object({
  task: z.string().min(1).describe('Task for Codex to execute'),
  verify: verifySchema
    .optional()
    .describe('Shell command to validate result. Triggers act-check-fix loop on failure.'),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(5)
    .default(2)
    .describe('Max retry attempts if verify fails. Default: 2'),
  // Codex options
  model: z
    .string()
    .optional()
    .describe(
      `Optional model override. Known: ${Object.values(MODELS).join(', ')}. If omitted, uses your Codex CLI default (~/.codex/config.toml).`
    ),
  fullAuto: z.boolean().optional().describe('Full automation mode'),
  sandboxMode: z
    .enum(['read-only', 'workspace-write', 'danger-full-access'])
    .optional()
    .describe('Access: read-only, workspace-write, danger-full-access'),
  workingDir: z.string().optional().describe('Working directory'),
  timeout: z.number().default(600000).describe('Codex timeout per attempt in ms. Default: 10min'),
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh'])
    .default('high')
    .describe(
      'Reasoning depth. Default: high (act-check-fix loops benefit from depth so retries converge). Override with "xhigh" for hard tasks, "medium" for simple verifiable steps.'
    ),
  oss: z.boolean().optional().describe('Use local Ollama/LM Studio'),
  localProvider: z.enum(['lmstudio', 'ollama']).optional(),
});

/**
 * Run a shell verification command and return structured result
 */
async function runVerify(
  command: string,
  expectedExitCode: number,
  timeoutMs: number,
  workingDir: string
): Promise<{
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh';
  const shellArgs =
    process.platform === 'win32'
      ? ['/c', `cd ${JSON.stringify(workingDir)} && ${command}`]
      : ['-c', `cd ${JSON.stringify(workingDir)} && ${command}`];

  const result = await executeCommandDetailed(shell, shellArgs, { timeoutMs });

  return {
    passed: !result.timedOut && result.code === expectedExitCode,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

/**
 * Build a fix prompt from the original task + verification failure
 */
function buildFixPrompt(
  originalTask: string,
  verify: { stdout: string; stderr: string; exitCode: number | null }
): string {
  const errContext = verify.stderr
    ? verify.stderr.substring(0, 1500)
    : verify.stdout.substring(0, 1500);

  return (
    `Previous attempt failed verification (exit code ${verify.exitCode}).\n\n` +
    `Error output:\n${errContext}\n\n` +
    `Original task: ${originalTask}\n\n` +
    `Fix the issue and complete the task.`
  );
}

export const doActTool: UnifiedTool = {
  name: 'do-act',
  description:
    'Execute task via Codex, verify with shell command, auto-fix on failure. Act-Check-Fix loop.',
  zodSchema: doActArgsSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      attempts: { type: 'number' },
      durationMs: { type: 'number' },
      steps: { type: 'array' },
    },
    required: ['status', 'attempts', 'durationMs', 'steps'],
  },
  prompt: {
    description: 'Execute task with verification-driven retry',
  },
  category: 'codex',
  execute: async (args, onProgress) => {
    const {
      task,
      verify,
      maxRetries = 2,
      model,
      sandboxMode,
      fullAuto,
      workingDir,
      timeout = 600000,
      reasoningEffort,
      oss,
      localProvider,
    } = args;

    const resolvedDir =
      resolveWorkingDirectory({ workingDir: workingDir as string | undefined }) || process.cwd();
    const totalAttempts = (verify ? (maxRetries as number) : 0) + 1;
    const startTime = Date.now();

    const codexOpts = {
      model: model as string | undefined,
      fullAuto: fullAuto !== false, // default true — do-act needs write access
      sandboxMode: (sandboxMode as any) ?? 'workspace-write',
      workingDir: resolvedDir,
      timeout: timeout as number,
      reasoningEffort: reasoningEffort as any,
      oss: oss as boolean | undefined,
      localProvider: localProvider as 'lmstudio' | 'ollama' | undefined,
    };

    let currentPrompt = task as string;
    const attempts: Array<{
      attempt: number;
      codexOutput: string;
      verifyPassed?: boolean;
      verifyExitCode?: number | null;
      verifyOutput?: string;
    }> = [];

    for (let i = 1; i <= totalAttempts; i++) {
      onProgress?.(`Attempt ${i}/${totalAttempts}...`);

      // ACT
      let codexOutput: string;
      try {
        const result = await executeCodex(currentPrompt, codexOpts, onProgress);
        codexOutput = result.output.trim() || result.stderr.trim() || result.output;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        attempts.push({ attempt: i, codexOutput: `Error: ${errMsg}` });

        // If Codex itself failed, retry with error context
        if (i < totalAttempts) {
          currentPrompt = `Previous attempt failed with error: ${errMsg}\n\nOriginal task: ${task}\n\nPlease try again.`;
          continue;
        }
        break;
      }

      // No verify — single attempt, done
      if (!verify) {
        attempts.push({
          attempt: i,
          codexOutput: codexOutput.substring(0, 2000),
          verifyPassed: true,
        });
        break;
      }

      // CHECK
      onProgress?.(`Verifying: ${(verify as any).command}...`);
      const verifyResult = await runVerify(
        (verify as any).command as string,
        ((verify as any).exitCode ?? 0) as number,
        ((verify as any).timeout ?? 60000) as number,
        resolvedDir
      );

      attempts.push({
        attempt: i,
        codexOutput: codexOutput.substring(0, 2000),
        verifyPassed: verifyResult.passed,
        verifyExitCode: verifyResult.exitCode,
        verifyOutput: (verifyResult.stderr || verifyResult.stdout).substring(0, 500),
      });

      if (verifyResult.passed) {
        onProgress?.(`Verification passed on attempt ${i}.`);
        break;
      }

      // FIX — build retry prompt
      if (i < totalAttempts) {
        onProgress?.(`Verification failed (exit ${verifyResult.exitCode}), retrying...`);
        currentPrompt = buildFixPrompt(task as string, verifyResult);
      }
    }

    // Build result
    const lastAttempt = attempts[attempts.length - 1];
    const passed = lastAttempt?.verifyPassed ?? false;
    const durationMs = Date.now() - startTime;

    const result = {
      status: passed ? 'success' : 'failed',
      attempts: attempts.length,
      durationMs,
      steps: attempts,
      ...(passed ? {} : { error: `Failed after ${attempts.length} attempt(s)` }),
    };

    // Return both human-readable summary and structured content
    const summary = passed
      ? `Task completed successfully (${attempts.length} attempt(s), ${Math.round(durationMs / 1000)}s)`
      : `Task failed after ${attempts.length} attempt(s) (${Math.round(durationMs / 1000)}s)`;

    return {
      text: `${summary}\n\n${JSON.stringify(result, null, 2)}`,
      structuredContent: result,
    } as StructuredToolResult;
  },
};
