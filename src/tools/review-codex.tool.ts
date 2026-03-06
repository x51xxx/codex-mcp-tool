import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCommandDetailed } from '../utils/commandExecutor.js';
import { MODELS, CLI } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { getModelWithFallback } from '../utils/modelDetection.js';

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
    .describe(`Model: ${Object.values(MODELS).join(', ')}. Default: uses Codex's default`),
  workingDir: z
    .string()
    .optional()
    .describe('Working directory to run the review in (passed via -C as a global Codex option)'),
  timeout: z.number().optional().describe('Maximum execution time in milliseconds'),
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
    const { prompt, uncommitted, base, commit, title, model, workingDir, timeout } = args;

    // Validation: prompt and uncommitted are mutually exclusive
    if (prompt && uncommitted) {
      return '❌ **Error**: The review prompt cannot be combined with uncommitted=true. Use a base/commit review or omit the prompt.';
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

      // Model selection via config
      const selectedModel = model
        ? await getModelWithFallback(model as string)
        : await getModelWithFallback();
      cmdArgs.push(CLI.FLAGS.CONFIG, `model="${selectedModel}"`);

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

      // Custom review instructions (positional arg after flags)
      if (prompt) {
        cmdArgs.push(prompt as string);
      }

      if (onProgress) {
        onProgress(`Executing: codex ${cmdArgs.join(' ')}`);
      }

      // Execute codex review
      const result = await executeCommandDetailed(CLI.COMMANDS.CODEX, cmdArgs, {
        onProgress,
        timeoutMs: (timeout as number) || 180000, // 3 minutes default
        cwd: resolvedDir || undefined,
      });

      // Codex CLI may output to stderr, so check both
      const response = result.stdout || result.stderr || 'No review output from Codex';

      if (!result.ok && !response) {
        throw new Error(result.stderr || 'Codex review command failed');
      }

      return `## Code Review Results\n\n**Model:** ${selectedModel}\n${base ? `**Base:** ${base}\n` : ''}${commit ? `**Commit:** ${commit}\n` : ''}\n${response}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('Review failed:', error);

      if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
        return '❌ **Error**: Codex CLI not found. Install with: npm install -g @openai/codex';
      }

      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        return '❌ **Authentication Failed**: Run "codex login" first';
      }

      return `❌ **Review Failed**: ${errorMessage}`;
    }
  },
};
