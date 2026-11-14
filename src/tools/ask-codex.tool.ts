import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeCodexCLI, executeCodex, CodexExecutionResult } from '../utils/codexExecutor.js';
import { processChangeModeOutput } from '../utils/changeModeRunner.js';
import { formatCodexResponseForMCP, ResponseMode } from '../utils/outputParser.js';
import { MODELS, APPROVAL_POLICIES, ERROR_MESSAGES } from '../constants.js';
import { createCodexError, formatErrorForUser, InvalidArgumentError } from '../utils/errorTypes.js';
import {
  getOrCreateSession,
  saveSession,
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
    .describe(
      `Optional model override. Known: ${Object.values(MODELS).join(', ')}. If omitted, uses your Codex CLI default (~/.codex/config.toml). Specify only to override.`
    ),
  sandbox: z
    .boolean()
    .default(false)
    .describe(
      'Quick automation mode: enables workspace-write with approval=never. Sandboxing remains active.'
    ),
  fullAuto: z
    .boolean()
    .optional()
    .describe('Compatibility alias for workspace-write with approval=never (not --yolo)'),
  approvalPolicy: z
    .enum(['never', 'on-request'])
    .optional()
    .describe(
      'Approval policy (-a): never, on-request. Note: non-interactive `codex exec` runs report `approval: never` even with on-request, since nobody can answer a prompt.'
    ),
  approval: z
    .enum(['never', 'on-request'])
    .optional()
    .describe(
      `Deprecated alias for approvalPolicy — both map to --ask-for-approval. Prefer approvalPolicy. Values: ${Object.values(APPROVAL_POLICIES).join(', ')}`
    ),
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
  profile: z
    .string()
    .optional()
    .describe(
      'Config profile (-p <name>): layers $CODEX_HOME/<name>.config.toml over the base config. Legacy [profiles.<name>] tables in config.toml make the CLI refuse the run.'
    ),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum execution time in milliseconds (optional)'),
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
  localProvider: z
    .enum(['lmstudio', 'ollama'])
    .optional()
    .describe(
      'Specify which local provider to use (lmstudio or ollama). Automatically enables --oss if not set. If omitted with --oss, uses config default or shows selection.'
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
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    .optional()
    .describe(
      'Reasoning depth. Omit to use the CLI default. max/ultra are model-dependent GPT-6/GPT-5.6 options; ultra may delegate to subagents.'
    ),
  // Session management (v1.4.0+)
  sessionId: z
    .string()
    .optional()
    .describe('Session ID for conversation continuity. Enables native Codex resume.'),
  resetSession: z
    .boolean()
    .optional()
    .describe('Clear session context before execution. Starts fresh conversation.'),
  // New parameters (v2.0.0)
  outputSchema: z
    .union([z.string(), z.record(z.any())])
    .optional()
    .describe('JSON Schema path or inline schema to constrain output format (Codex CLI v0.95.0+)'),
  personality: z
    .enum(['pragmatic', 'friendly', 'none'])
    .optional()
    .describe(
      'Communication style: pragmatic (concise, machine-friendly), friendly (conversational) or none (no personality instructions)'
    ),
  skipGitRepoCheck: z
    .boolean()
    .optional()
    .describe(
      'Skip git repository validation. Useful for non-git directories (Codex CLI v0.75.0+)'
    ),
  outputLastMessage: z
    .string()
    .optional()
    .describe(
      'Write final Codex message to file path. Useful for CI/CD result capture (Codex CLI v0.95.0+)'
    ),
  strictConfig: z
    .boolean()
    .optional()
    .describe('Fail when config.toml contains fields unknown to the installed Codex CLI'),
  ephemeral: z.boolean().optional().describe('Run without persisting Codex session files to disk'),
  ignoreUserConfig: z
    .boolean()
    .optional()
    .describe('Ignore $CODEX_HOME/config.toml for this run; authentication is still loaded'),
  ignoreRules: z
    .boolean()
    .optional()
    .describe('Ignore user and project execpolicy .rules files for this run'),
  bypassHookTrust: z
    .boolean()
    .optional()
    .describe('DANGEROUS: run enabled hooks without persisted hook trust'),
  responseMode: z
    .enum(['clean', 'full'])
    .default('clean')
    .describe(
      'Response verbosity: "clean" returns only the final answer (default), "full" returns the complete execution log including thinking, tool calls, and agent activity'
    ),
});

export const askCodexTool: UnifiedTool = {
  name: 'ask-codex',
  description:
    'Execute Codex CLI with file analysis (@syntax), skills ($syntax), model selection, and safety controls. Supports changeMode.',
  zodSchema: askCodexArgsSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
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
      reasoningEffort,
      sessionId,
      resetSession,
      localProvider,
      outputSchema,
      personality,
      skipGitRepoCheck,
      outputLastMessage,
      strictConfig,
      ephemeral,
      ignoreUserConfig,
      ignoreRules,
      bypassHookTrust,
      responseMode,
    } = args;

    if (!prompt?.trim()) {
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
    }

    if (ephemeral && sessionId) {
      throw new InvalidArgumentError(
        'ephemeral cannot be combined with sessionId because the session is not persisted'
      );
    }

    // Chunk requests are answered from the cache (or rejected) without
    // running Codex: only chunk 1 with no cache key starts a fresh run.
    if (changeMode && chunkIndex !== undefined && (chunkCacheKey || chunkIndex !== 1)) {
      return processChangeModeOutput('', {
        chunkIndex: chunkIndex as number,
        cacheKey: chunkCacheKey as string,
        prompt: prompt as string,
      });
    }

    // Session management (v1.4.0+)
    let codexConversationId: string | undefined;
    let activeSessionId: string | undefined;
    // Model to keep on resume: `exec resume` otherwise falls back to the
    // config default, silently switching models mid-conversation.
    let sessionModel: string | undefined;

    // Resolve working directory for session
    const resolvedWorkingDir = resolveWorkingDirectory({
      workingDir: (workingDir || cd) as string,
      prompt: prompt as string,
    });

    // Sessions are keyed by directory + sessionId; every lookup and update
    // below must use the same directory or it would address another entry.
    const sessionDir = resolvedWorkingDir || process.cwd();

    if (sessionId) {
      if (resetSession) {
        deleteSession(sessionId as string, sessionDir);
      }
      // A sessionId used in another directory is a separate session, so it
      // never resumes (or replaces) that directory's conversation.
      const session = getOrCreateSession(sessionDir, sessionId as string);
      activeSessionId = session.sessionId;
      codexConversationId = session.codexConversationId;
      sessionModel = codexConversationId ? session.model : undefined;
    }

    try {
      // Use enhanced executeCodex for better feature support
      const result = await executeCodex(
        prompt as string,
        {
          model: (model as string | undefined) || sessionModel,
          // Legacy `sandbox: true` is shorthand for fullAuto; with an explicit
          // approval policy it only selects the writable sandbox, instead of
          // tripping the fullAuto/approval conflict the caller never asked for.
          fullAuto: Boolean(fullAuto || (sandbox && !approvalPolicy && !approval)),
          approvalPolicy: approvalPolicy as any,
          approval: approval as string,
          sandboxMode: (sandboxMode ??
            (sandbox && !fullAuto && (approvalPolicy || approval)
              ? 'workspace-write'
              : undefined)) as any,
          yolo: Boolean(yolo),
          cd: cd as string,
          workingDir: workingDir as string,
          image,
          config,
          profile: profile as string,
          timeout: timeout as number,
          search: search as boolean,
          oss: oss as boolean,
          localProvider: localProvider as 'lmstudio' | 'ollama' | undefined,
          enableFeatures: enableFeatures as string[],
          disableFeatures: disableFeatures as string[],
          addDirs: addDirs as string[],
          toolOutputTokenLimit: toolOutputTokenLimit as number,
          reasoningEffort: reasoningEffort as
            | 'low'
            | 'medium'
            | 'high'
            | 'xhigh'
            | 'max'
            | 'ultra'
            | undefined,
          codexConversationId, // Pass conversation ID for resume
          changeMode: Boolean(changeMode), // Pass changeMode for format instructions
          outputSchema,
          personality: personality as 'pragmatic' | 'friendly' | 'none' | undefined,
          skipGitRepoCheck: Boolean(skipGitRepoCheck),
          outputLastMessage: outputLastMessage as string | undefined,
          strictConfig: Boolean(strictConfig),
          ephemeral: Boolean(ephemeral),
          ignoreUserConfig: Boolean(ignoreUserConfig),
          ignoreRules: Boolean(ignoreRules),
          bypassHookTrust: Boolean(bypassHookTrust),
        },
        onProgress
      );

      // Parse and store conversation ID from response for future resume
      // Conversation ID may be in stdout OR stderr - check both
      if (activeSessionId) {
        // Codex prints the thread ID in its stderr banner; stdout is the
        // model's answer and must not be able to inject one.
        const newConversationId = parseConversationIdFromOutput(result.stderr);
        if (newConversationId) {
          setCodexConversationId(activeSessionId, newConversationId, sessionDir);
        }

        // Update session with latest prompt/response
        saveSession({
          sessionId: activeSessionId,
          lastPrompt: prompt as string,
          lastResponse: result.output.substring(0, 1000), // Store truncated response
          model: (model as string | undefined) || sessionModel,
          workingDir: sessionDir,
        });
      }

      if (changeMode) {
        return processChangeModeOutput(result.output, {
          chunkIndex: args.chunkIndex as number | undefined,
          prompt: prompt as string,
        });
      }

      // Format response with enhanced output parsing
      // Pass stderr for metadata extraction (Codex CLI v0.114.0+ sends metadata to stderr)
      return formatCodexResponseForMCP(
        result.output,
        includeThinking as boolean,
        includeMetadata as boolean,
        result.stderr,
        (responseMode as ResponseMode) || 'clean'
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
