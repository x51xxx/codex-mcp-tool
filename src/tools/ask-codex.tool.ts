import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCodexCLI, executeCodex, CodexExecutionResult } from '../utils/codexExecutor.js';
import { processChangeModeOutput } from '../utils/changeModeRunner.js';
import { formatCodexResponseForMCP } from '../utils/outputParser.js';
import { MODELS, APPROVAL_POLICIES, ERROR_MESSAGES } from '../constants.js';
import { createCodexError, formatErrorForUser } from '../utils/errorTypes.js';
import {
  getOrCreateSession,
  saveSession,
  getCodexConversationId,
  setCodexConversationId,
  parseConversationIdFromOutput,
  deleteSession,
} from '../utils/sessionStorage.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';

const askCodexArgsSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe("Task or question. Use @ to include files (e.g., '@largefile.ts explain')."),
  model: z
    .string()
    .optional()
    .describe(`Model: ${Object.values(MODELS).join(', ')}. Default: gpt-5.1-codex-max`),
  sandbox: z
    .boolean()
    .default(false)
    .describe(
      'Quick automation mode: enables workspace-write + on-failure approval. Alias for fullAuto.'
    ),
  fullAuto: z.boolean().optional().describe('Full automation mode'),
  approvalPolicy: z
    .enum(['never', 'on-request', 'on-failure', 'untrusted'])
    .optional()
    .describe('Approval: never, on-request, on-failure, untrusted'),
  approval: z
    .string()
    .optional()
    .describe(`Approval policy: ${Object.values(APPROVAL_POLICIES).join(', ')}`),
  sandboxMode: z
    .enum(['read-only', 'workspace-write', 'danger-full-access'])
    .optional()
    .describe('Access: read-only, workspace-write, danger-full-access'),
  yolo: z.boolean().optional().describe('⚠️ Bypass all safety (dangerous)'),
  cd: z.string().optional().describe('Working directory'),
  workingDir: z.string().optional().describe('Working directory for execution'),
  changeMode: z
    .boolean()
    .default(false)
    .describe('Return structured OLD/NEW edits for refactoring'),
  chunkIndex: z
    .preprocess(val => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? undefined : parsed;
      }
      return undefined;
    }, z.number().min(1).optional())
    .describe('Chunk index (1-based)'),
  chunkCacheKey: z.string().optional().describe('Cache key for continuation'),
  image: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Optional image file path(s) to include with the prompt'),
  config: z
    .union([z.string(), z.record(z.any())])
    .optional()
    .describe("Configuration overrides as 'key=value' string or object"),
  profile: z.string().optional().describe('Configuration profile to use from ~/.codex/config.toml'),
  timeout: z.number().optional().describe('Maximum execution time in milliseconds (optional)'),
  includeThinking: z
    .boolean()
    .default(true)
    .describe('Include reasoning/thinking section in response'),
  includeMetadata: z.boolean().default(true).describe('Include configuration metadata in response'),
  search: z
    .boolean()
    .optional()
    .describe(
      'Enable web search using native --search flag (v0.52.0+). Requires network access - automatically sets sandbox to workspace-write if not specified.'
    ),
  oss: z
    .boolean()
    .optional()
    .describe(
      'Use local Ollama server (convenience for -c model_provider=oss). Requires Ollama running locally. Automatically sets sandbox to workspace-write if not specified.'
    ),
  enableFeatures: z
    .array(z.string())
    .optional()
    .describe('Enable feature flags (repeatable). Equivalent to -c features.<name>=true'),
  disableFeatures: z
    .array(z.string())
    .optional()
    .describe('Disable feature flags (repeatable). Equivalent to -c features.<name>=false'),
  // New parameters (v1.3.0+)
  addDirs: z
    .array(z.string())
    .optional()
    .describe(
      'Additional writable directories beyond workspace (e.g., ["/tmp", "/var/log"]). Useful for monorepos and multi-directory projects.'
    ),
  toolOutputTokenLimit: z
    .number()
    .min(100)
    .max(10000)
    .optional()
    .describe('Maximum tokens for tool outputs (100-10,000). Controls response verbosity.'),
  // Session management (v1.4.0+)
  sessionId: z
    .string()
    .optional()
    .describe('Session ID for conversation continuity. Enables native Codex resume.'),
  resetSession: z
    .boolean()
    .optional()
    .describe('Clear session context before execution. Starts fresh conversation.'),
});

export const askCodexTool: UnifiedTool = {
  name: 'ask-codex',
  description:
    'Execute Codex CLI with file analysis (@syntax), model selection, and safety controls. Supports changeMode.',
  zodSchema: askCodexArgsSchema,
  prompt: {
    description: 'Execute Codex CLI with optional changeMode',
  },
  category: 'utility',
  execute: async (args, onProgress) => {
    const {
      prompt,
      model,
      sandbox,
      fullAuto,
      approvalPolicy,
      approval,
      sandboxMode,
      yolo,
      cd,
      workingDir,
      changeMode,
      chunkIndex,
      chunkCacheKey,
      image,
      config,
      profile,
      timeout,
      includeThinking,
      includeMetadata,
      search,
      oss,
      enableFeatures,
      disableFeatures,
      addDirs,
      toolOutputTokenLimit,
      sessionId,
      resetSession,
    } = args;

    if (!prompt?.trim()) {
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
    }

    if (changeMode && chunkIndex && chunkCacheKey) {
      return processChangeModeOutput('', {
        chunkIndex: chunkIndex as number,
        cacheKey: chunkCacheKey as string,
        prompt: prompt as string,
      });
    }

    // Session management (v1.4.0+)
    let codexConversationId: string | undefined;
    let activeSessionId: string | undefined;

    if (sessionId) {
      // Handle session reset
      if (resetSession) {
        deleteSession(sessionId as string);
      } else {
        // Try to get existing Codex conversation ID for resume
        codexConversationId = getCodexConversationId(sessionId as string);
      }
      activeSessionId = sessionId as string;
    }

    // Resolve working directory for session
    const resolvedWorkingDir = resolveWorkingDirectory({
      workingDir: (workingDir || cd) as string,
      prompt: prompt as string,
    });

    // Get or create session if sessionId provided
    if (activeSessionId && resolvedWorkingDir) {
      const session = getOrCreateSession(resolvedWorkingDir, activeSessionId);
      activeSessionId = session.sessionId;
      if (!codexConversationId) {
        codexConversationId = session.codexConversationId;
      }
    }

    try {
      // Use enhanced executeCodex for better feature support
      const result = await executeCodex(
        prompt as string,
        {
          model: model as string,
          fullAuto: Boolean(fullAuto ?? sandbox),
          approvalPolicy: approvalPolicy as any,
          approval: approval as string,
          sandboxMode: sandboxMode as any,
          yolo: Boolean(yolo),
          cd: cd as string,
          workingDir: workingDir as string,
          image,
          config,
          profile: profile as string,
          timeout: timeout as number,
          search: search as boolean,
          oss: oss as boolean,
          enableFeatures: enableFeatures as string[],
          disableFeatures: disableFeatures as string[],
          addDirs: addDirs as string[],
          toolOutputTokenLimit: toolOutputTokenLimit as number,
          codexConversationId, // Pass conversation ID for resume
        },
        onProgress
      );

      // Parse and store conversation ID from response for future resume
      // Conversation ID may be in stdout OR stderr - check both
      if (activeSessionId) {
        const combinedOutput = `${result.output}\n${result.stderr}`;
        const newConversationId = parseConversationIdFromOutput(combinedOutput);
        if (newConversationId) {
          setCodexConversationId(activeSessionId, newConversationId);
        }

        // Update session with latest prompt/response
        saveSession({
          sessionId: activeSessionId,
          lastPrompt: prompt as string,
          lastResponse: result.output.substring(0, 1000), // Store truncated response
          model: model as string,
          workingDir: resolvedWorkingDir,
        });
      }

      if (changeMode) {
        return processChangeModeOutput(result.output, {
          chunkIndex: args.chunkIndex as number | undefined,
          prompt: prompt as string,
        });
      }

      // Format response with enhanced output parsing
      return formatCodexResponseForMCP(
        result.output,
        includeThinking as boolean,
        includeMetadata as boolean
      );
    } catch (error) {
      // Use structured error handling
      const codexError = createCodexError(error instanceof Error ? error : String(error), {
        sessionId: activeSessionId,
        model: model as string,
        workingDir: resolvedWorkingDir,
      });

      return `❌ ${formatErrorForUser(codexError)}`;
    }
  },
};
