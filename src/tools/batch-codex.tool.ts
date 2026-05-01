import { z } from 'zod';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { executeCodex } from '../utils/codexExecutor.js';
import { MODELS, SANDBOX_MODES } from '../constants.js';

// Define task type for batch operations
const batchTaskSchema = z.object({
  task: z.string().describe('Atomic task description'),
  target: z.string().optional().describe('Target files/directories (use @ syntax)'),
  priority: z.enum(['high', 'normal', 'low']).default('normal').describe('Task priority'),
});

type BatchTask = z.infer<typeof batchTaskSchema>;

interface BatchTaskResult {
  task: string;
  status: 'success' | 'failed' | 'skipped';
  output?: string;
  error?: string;
}

const batchCodexArgsSchema = z.object({
  tasks: z.array(batchTaskSchema).min(1).describe('Array of atomic tasks to delegate to Codex'),
  model: z
    .string()
    .optional()
    .describe(
      `Optional model override applied to every task. Known: ${Object.values(MODELS).join(', ')}. If omitted, uses your Codex CLI default (~/.codex/config.toml).`
    ),
  sandbox: z
    .string()
    .default(SANDBOX_MODES.WORKSPACE_WRITE)
    .describe(`Sandbox mode: ${Object.values(SANDBOX_MODES).join(', ')}`),
  parallel: z.boolean().default(false).describe('Execute independent tasks in parallel'),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Maximum parallel Codex processes when parallel=true. Default: min(task count, 4)'),
  stopOnError: z.boolean().default(true).describe('Stop execution if any task fails'),
  timeout: z.number().optional().describe('Maximum execution time per task in milliseconds'),
  workingDir: z.string().optional().describe('Working directory for execution'),
  search: z
    .boolean()
    .optional()
    .describe('Enable web search for all tasks (activates web_search_request feature)'),
  oss: z.boolean().optional().describe('Use local Ollama server'),
  enableFeatures: z.array(z.string()).optional().describe('Enable feature flags'),
  disableFeatures: z.array(z.string()).optional().describe('Disable feature flags'),
});

export const batchCodexTool: UnifiedTool = {
  name: 'batch-codex',
  description:
    'Delegate multiple atomic tasks to Codex for batch processing. Ideal for repetitive operations, mass refactoring, and automated code transformations',
  zodSchema: batchCodexArgsSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  outputSchema: {
    type: 'object',
    properties: {
      total: { type: 'number' },
      successful: { type: 'number' },
      failed: { type: 'number' },
      skipped: { type: 'number' },
      results: { type: 'array' },
    },
    required: ['total', 'successful', 'failed', 'skipped', 'results'],
  },
  prompt: {
    description: 'Execute multiple atomic Codex tasks in batch mode for efficient automation',
  },
  category: 'codex',
  execute: async (args, onProgress) => {
    const {
      tasks,
      model,
      sandbox,
      parallel,
      concurrency,
      stopOnError,
      timeout,
      workingDir,
      search,
      oss,
      enableFeatures,
      disableFeatures,
    } = args;
    const taskList = tasks as BatchTask[];

    if (!taskList || taskList.length === 0) {
      throw new Error('No tasks provided for batch execution');
    }

    // Sort tasks by priority
    const sortedTasks = [...taskList].sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return (
        priorityOrder[a.priority as keyof typeof priorityOrder] -
        priorityOrder[b.priority as keyof typeof priorityOrder]
      );
    });

    const results: BatchTaskResult[] = new Array(sortedTasks.length);
    let failedCount = 0;
    let successCount = 0;
    let skippedCount = 0;

    if (onProgress) {
      const mode = parallel
        ? `parallel mode (concurrency ${Math.min(
            (concurrency as number | undefined) ?? 4,
            sortedTasks.length
          )})`
        : 'sequential mode';
      onProgress(`🚀 Starting batch execution of ${sortedTasks.length} tasks in ${mode}...`);
    }

    const runTask = async (i: number): Promise<void> => {
      const task = sortedTasks[i];
      const taskPrompt = task.target ? `${task.task} in ${task.target}` : task.task;

      if (onProgress) {
        onProgress(`\n[${i + 1}/${sortedTasks.length}] Executing: ${taskPrompt}`);
      }

      try {
        const result = await executeCodex(
          taskPrompt,
          {
            model: model as string,
            sandboxMode: sandbox as any,
            timeout: timeout as number,
            workingDir: workingDir as string,
            search: search as boolean,
            oss: oss as boolean,
            enableFeatures: enableFeatures as string[],
            disableFeatures: disableFeatures as string[],
          },
          undefined // No progress for individual tasks to keep output clean
        );

        results[i] = {
          task: taskPrompt,
          status: 'success',
          output: (result.output.trim() || result.stderr.trim() || result.output).substring(0, 500), // Truncate for summary
        };
        successCount++;

        if (onProgress) {
          onProgress(`✅ Completed: ${task.task}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results[i] = {
          task: taskPrompt,
          status: 'failed',
          error: errorMessage,
        };
        failedCount++;

        if (onProgress) {
          onProgress(`❌ Failed: ${task.task} - ${errorMessage}`);
        }
      }
    };

    if (parallel) {
      let nextTaskIndex = 0;
      let stopScheduling = false;
      const workerCount = Math.min((concurrency as number | undefined) ?? 4, sortedTasks.length);

      const worker = async (): Promise<void> => {
        while (!stopScheduling) {
          const currentIndex = nextTaskIndex++;
          if (currentIndex >= sortedTasks.length) {
            return;
          }

          await runTask(currentIndex);

          if (stopOnError && results[currentIndex]?.status === 'failed') {
            stopScheduling = true;
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (stopOnError) {
        for (let i = 0; i < sortedTasks.length; i++) {
          if (!results[i]) {
            const task = sortedTasks[i];
            const taskPrompt = task.target ? `${task.task} in ${task.target}` : task.task;
            results[i] = {
              task: taskPrompt,
              status: 'skipped',
              error: 'Skipped due to previous failure',
            };
            skippedCount++;
          }
        }
      }
    } else {
      for (let i = 0; i < sortedTasks.length; i++) {
        const task = sortedTasks[i];
        const taskPrompt = task.target ? `${task.task} in ${task.target}` : task.task;

        // Skip remaining tasks if stopOnError is true and we have failures
        if (stopOnError && failedCount > 0) {
          results[i] = {
            task: taskPrompt,
            status: 'skipped',
            error: 'Skipped due to previous failure',
          };
          skippedCount++;
          continue;
        }

        await runTask(i);
      }
    }

    // Generate summary report
    let report = `\n📊 **Batch Execution Summary**\n`;
    report += `\n- Total tasks: ${sortedTasks.length}`;
    report += `\n- Successful: ${successCount} ✅`;
    report += `\n- Failed: ${failedCount} ❌`;
    report += `\n- Skipped: ${skippedCount} ⏭️`;

    report += `\n\n**Task Results:**\n`;
    for (const result of results) {
      const icon = result.status === 'success' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
      report += `\n${icon} **${result.task}**`;
      if (result.status === 'success' && result.output) {
        report += `\n   Output: ${result.output.substring(0, 100)}...`;
      } else if (result.error) {
        report += `\n   Error: ${result.error}`;
      }
    }

    // If all tasks failed, throw an error
    if (failedCount === sortedTasks.length) {
      throw new Error(`All ${failedCount} tasks failed. See report above for details.`);
    }

    return {
      text: report,
      structuredContent: {
        total: sortedTasks.length,
        successful: successCount,
        failed: failedCount,
        skipped: skippedCount,
        results,
      },
    } as StructuredToolResult;
  },
};
