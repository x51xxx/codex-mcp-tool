import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCommandDetailed } from '../utils/commandExecutor.js';
import { parseReviewOutput, formatReviewFindings } from '../utils/reviewParser.js';
import { MODELS } from '../constants.js';
import { Logger } from '../utils/logger.js';

const reviewCodexArgsSchema = z.object({
  prompt: z
    .string()
    .default('/review')
    .describe('Review command or additional context. Default: /review'),
  model: z
    .string()
    .optional()
    .describe(`Model: ${Object.values(MODELS).join(', ')}. Default: uses Codex's default`),
  timeout: z.number().optional().describe('Maximum execution time in milliseconds'),
});

export const reviewCodexTool: UnifiedTool = {
  name: 'review-changes',
  description: "Run Codex's native /review command to analyze current git changes",
  zodSchema: reviewCodexArgsSchema,
  prompt: {
    description: "Execute Codex's built-in code review on current changes",
  },
  category: 'codex',
  execute: async (args, onProgress) => {
    const { prompt, model, timeout } = args;

    try {
      // Step 1: Prepare the review command
      if (onProgress) {
        onProgress('🔍 Launching Codex native review...');
      }

      // Build command arguments for Codex CLI
      const codexArgs = ['exec'];

      // Add model if specified
      if (model) {
        codexArgs.push('-m', model);
      }

      // The review command - either /review or custom prompt
      const reviewPrompt = prompt?.startsWith('/') ? prompt : `/review ${prompt || ''}`.trim();
      codexArgs.push(reviewPrompt);

      if (onProgress) {
        onProgress(`Executing: codex ${codexArgs.join(' ')}`);
      }

      // Step 2: Execute Codex with the review command
      const result = await executeCommandDetailed('codex', codexArgs, {
        timeoutMs: timeout || 180000, // 3 minutes default for review
      });

      if (!result.ok) {
        throw new Error(result.stderr || 'Codex review command failed');
      }

      const response = result.stdout;

      // Step 3: Parse and format the review output
      if (onProgress) {
        onProgress('📝 Processing review results...');
      }

      // Try to parse structured output
      const reviewOutput = parseReviewOutput(response);

      if (reviewOutput) {
        // Format the structured review
        const formattedReview = formatReviewFindings(reviewOutput);

        // Add summary statistics
        const stats = [
          `📊 **Review Statistics:**`,
          `- Issues found: ${reviewOutput.findings.length}`,
          `- High priority issues: ${reviewOutput.findings.filter(f => f.priority === 0 || f.priority === 1).length}`,
        ];

        return `${formattedReview}\n\n${stats.join('\n')}`;
      } else {
        // Return Codex's raw output if not in JSON format
        // Codex might return formatted text directly
        return `## Codex Review Results\n\n${response}`;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('Review failed:', error);

      if (errorMessage.includes('command not found')) {
        return '❌ **Error**: Codex CLI not found. Install with: npm install -g @openai/codex';
      }

      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        return '❌ **Authentication Failed**: Run "codex login" first';
      }

      if (errorMessage.includes('slash command')) {
        return "❌ **Error**: Review command not available. Make sure you're using the latest Codex version.";
      }

      return `❌ **Review Failed**: ${errorMessage}\n\nTip: Try running "codex exec /review" directly to test.`;
    }
  },
};
