import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCommandDetailed } from '../utils/commandExecutor.js';
import { MODELS, CLI } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { isValidModel, assertReasoningEffortSupported } from '../utils/modelDetection.js';
import { extractCodexDiagnostic } from '../utils/codexExecutor.js';
import { InvalidArgumentError } from '../utils/errorTypes.js';

const reviewCodexArgsSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe(
      'Custom review instructions or focus areas (cannot be used with uncommitted=true; use base/commit review instead)'
    ),
  uncommitted: z
    .boolean()
    .optional()
    .describe(
      'Review staged, unstaged, and untracked changes (working tree) - cannot be combined with custom prompt'
    ),
  base: z
    .string()
    .optional()
    .describe('Review changes against a specific base branch (e.g., "main", "develop")'),
  commit: z.string().optional().describe('Review the changes introduced by a specific commit SHA'),
  title: z.string().optional().describe('Optional title to display in the review summary'),
  model: z
    .string()
    .optional()
    .describe(
      `Optional model override. Known: ${Object.values(MODELS).join(', ')}. If omitted, uses your Codex CLI default (~/.codex/config.toml).`
    ),
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    .default('high')
    .describe(
      'Reasoning depth for the review. Default: high (code review benefits from deep reasoning).'
    ),
  workingDir: z
    .string()
    .optional()
    .describe('Working directory to run the review in (passed via -C as a global Codex option)'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum execution time in milliseconds'),
});

export const reviewCodexTool: UnifiedTool = {
  name: 'review-changes',
  description:
    'Run a code review against the current repository using Codex CLI native review subcommand',
  zodSchema: reviewCodexArgsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  prompt: {
    description: "Execute Codex's built-in code review on current changes",
  },
  category: 'codex',
  execute: async (args, onProgress) => {
    const {
      prompt,
      uncommitted,
      base,
      commit,
      title,
      model,
      reasoningEffort,
      workingDir,
      timeout,
    } = args;

    // Validation: prompt and uncommitted are mutually exclusive
    if (prompt && uncommitted) {
      return '❌ **Error**: The review prompt cannot be combined with uncommitted=true. Use a base/commit review or omit the prompt.';
    }

    // A value starting with '-' would be read as an option by Codex (and by
    // the git commands it runs for the review).
    for (const [name, value] of [
      ['base', base],
      ['commit', commit],
    ] as const) {
      if (typeof value === 'string' && value.startsWith('-')) {
        return `❌ **Error**: \`${name}\` must be a branch name or commit SHA, not an option: ${value}`;
      }
    }

    try {
      if (onProgress) {
        onProgress('Starting code review...');
      }

      // Build command arguments for codex review
      const cmdArgs: string[] = [];

      // Global flags (before subcommand)
      const resolvedDir = resolveWorkingDirectory({ workingDir: workingDir as string });
      if (resolvedDir) {
        cmdArgs.push(CLI.FLAGS.WORKING_DIR, resolvedDir);
      }

      // The tool is advertised as read-only; pin the sandbox instead of
      // inheriting whatever sandbox_mode the user's config.toml sets.
      cmdArgs.push(CLI.FLAGS.SANDBOX_MODE, 'read-only');

      // Model selection via config. When omitted, defer to Codex CLI config/default.
      const selectedModel = model as string | undefined;
      if (selectedModel) {
        if (!isValidModel(selectedModel)) {
          Logger.warn(`Model '${selectedModel}' not in known list — passing through to Codex CLI`);
        }
        // JSON string syntax is a valid TOML basic string, quotes escaped.
        cmdArgs.push(CLI.FLAGS.CONFIG, `model=${JSON.stringify(selectedModel)}`);
      }

      // Reasoning effort (defaults to 'high' via zod schema — code review benefits from depth)
      const effort = reasoningEffort as
        | 'low'
        | 'medium'
        | 'high'
        | 'xhigh'
        | 'max'
        | 'ultra'
        | undefined;
      if (effort) {
        // This tool builds its own argument list, so it does not inherit
        // CodexCommandBuilder's validation — check the pairing explicitly.
        assertReasoningEffortSupported(selectedModel, effort);
        cmdArgs.push(CLI.FLAGS.CONFIG, `model_reasoning_effort="${effort}"`);
      }

      // The review subcommand
      cmdArgs.push('review');

      // Review-specific flags
      if (uncommitted) {
        cmdArgs.push('--uncommitted');
      }

      if (base) {
        cmdArgs.push('--base', base as string);
      }

      if (commit) {
        cmdArgs.push('--commit', commit as string);
      }

      if (title) {
        cmdArgs.push('--title', title as string);
      }

      // Custom review instructions (positional arg after flags). `--` keeps a
      // prompt that starts with '-' from being parsed as an option.
      if (prompt) {
        cmdArgs.push('--', prompt as string);
      }

      if (onProgress) {
        onProgress(`Executing: codex ${cmdArgs.join(' ')}`);
      }

      // Execute codex review. Reviews commonly run at high reasoning effort
      // and spawn their own verification commands, so they need more headroom
      // than a plain prompt — 3 minutes was cutting real reviews off mid-run.
      const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, cmdArgs, {
        onProgress,
        timeoutMs: (timeout as number) || 600000, // 10 minutes default
        cwd: resolvedDir || undefined,
      });

      // Codex CLI may output to stderr, so check both
      const response = result.stdout || result.stderr || 'No review output from Codex';

      if (result.aborted) {
        return '❌ **Review Cancelled** by the client.';
      }

      // A killed-by-timeout run may still have a large partial transcript —
      // that is not a completed review, so it must not be presented as one.
      if (result.timedOut) {
        return {
          text:
            `⏱️ **Review Timed Out** after ${(timeout as number) || 600000}ms before Codex finished. ` +
            `Retry with a larger \`timeout\`, or a lower \`reasoningEffort\`.\n\n` +
            `<details><summary>Partial transcript</summary>\n\n${response}\n\n</details>`,
          isError: true,
        };
      }

      // Any failed run is an error, not a review — even if it printed some
      // stdout before failing. Show the real error lines from stderr.
      if (!result.ok) {
        const reason = result.outputExceeded
          ? 'Codex output exceeded the size limit and was stopped.'
          : extractCodexDiagnostic(result.stderr);
        return (
          `❌ **Review Failed** (exit ${result.code}): ${reason}` +
          (result.stdout
            ? `\n\n<details><summary>Partial output</summary>\n\n${result.stdout}\n\n</details>`
            : '')
        );
      }

      return `## Code Review Results\n\n**Model:** ${selectedModel ?? 'Codex CLI default'}\n${base ? `**Base:** ${base}\n` : ''}${commit ? `**Commit:** ${commit}\n` : ''}\n${response}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('Review failed:', error);

      if (error instanceof InvalidArgumentError) {
        return `❌ **Invalid Arguments**: ${errorMessage}`;
      }

      // Pre-flight diagnostics already name the real cause; keep them intact.
      if (
        errorMessage.startsWith("'codex' was not found") ||
        errorMessage.startsWith('Working directory')
      ) {
        return `❌ **Review Failed**: ${errorMessage}`;
      }

      if (errorMessage.includes('command not found')) {
        return '❌ **Error**: Codex CLI not found. Install with: npm install -g @openai/codex';
      }

      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        return '❌ **Authentication Failed**: Run "codex login" first';
      }

      return `❌ **Review Failed**: ${errorMessage}`;
    }
  },
};
