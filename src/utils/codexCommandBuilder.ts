import { CLI } from '../constants.js';
import { Logger } from './logger.js';
import { resolveWorkingDirectory } from './workingDirResolver.js';
import { getModelWithFallback } from './modelDetection.js';
import {
  supportsNativeSearch,
  supportsAddDir,
  supportsToolTokenLimit,
  supportsResume,
  supportsSkipGitCheck,
  supportsPersonality,
  supportsOutputSchema,
  supportsOutputLastMessage,
} from './versionDetection.js';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

/**
 * Options for CodexCommandBuilder
 */
export interface CodexCommandBuilderOptions {
  readonly model?: string;
  readonly fullAuto?: boolean;
  readonly approvalPolicy?: string;
  readonly sandboxMode?: string;
  readonly approval?: string;
  readonly yolo?: boolean;
  readonly cd?: string;
  readonly workingDir?: string;
  readonly config?: string | Record<string, any>;
  readonly profile?: string;
  readonly image?: string | string[];
  readonly search?: boolean;
  readonly oss?: boolean;
  readonly localProvider?: 'lmstudio' | 'ollama';
  readonly enableFeatures?: string[];
  readonly disableFeatures?: string[];
  readonly addDirs?: string[];
  readonly toolOutputTokenLimit?: number;
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  readonly useExec?: boolean;
  readonly concisePrompt?: boolean;
  readonly useStdinForLongPrompts?: boolean;
  // Session/Resume support (v1.4.0+)
  readonly codexConversationId?: string; // Native Codex conversation ID for resume
  // Change mode support
  readonly changeMode?: boolean; // Prepend format instructions for structured OLD/NEW edits
  // New parameters (v2.0.0)
  readonly outputSchema?: string | Record<string, any>; // JSON Schema path or inline schema
  readonly personality?: 'pragmatic' | 'friendly'; // Communication style
  readonly skipGitRepoCheck?: boolean; // Skip git repo validation
  readonly outputLastMessage?: string; // Write final message to file path
}

/**
 * Result of building a Codex command
 */
export interface BuildResult {
  args: string[];
  tempFiles: string[];
  finalPrompt: string;
  useResume: boolean; // Whether resume command is being used
  workingDir?: string; // Resolved working directory for spawn cwd
}

/**
 * Builder class for constructing Codex CLI commands
 * Eliminates code duplication between executeCodexCLI and executeCodex
 */
export class CodexCommandBuilder {
  private args: string[] = [];
  private tempFiles: string[] = [];
  private useResumeMode: boolean = false;
  private resolvedWorkingDir?: string;

  /**
   * Build a complete Codex CLI command with all options
   * @param prompt User prompt
   * @param options Command options
   * @returns Build result with args, temp file, and final prompt
   */
  async build(prompt: string, options?: CodexCommandBuilderOptions): Promise<BuildResult> {
    this.args = []; // Reset args for fresh build
    this.tempFiles = [];
    this.useResumeMode = false;
    this.resolvedWorkingDir = undefined;

    // 1. Validation
    this.validateOptions(options);

    // 2. Check if we should use resume mode
    await this.checkResumeMode(options);

    // 3. Model selection with fallback (skip validation for OSS/local models)
    const isOssMode = !!(options?.oss || options?.localProvider);
    await this.addModelArg(options?.model, isOssMode);

    // 4. Safety controls (yolo, fullAuto, approval, sandbox)
    this.addSafetyArgs(options);

    // 5. Working directory
    this.addWorkingDir(options, prompt);

    // 6. OSS flags are deferred to after exec (step 14b) —
    //    Codex CLI only applies --oss/--local-provider as exec subcommand flags.

    // 7. Search + Feature flags (shared 69-line logic)
    await this.addSearchAndFeatures(options);

    // 8. Disable features
    if (options?.disableFeatures && Array.isArray(options.disableFeatures)) {
      for (const feature of options.disableFeatures) {
        this.args.push(CLI.FLAGS.DISABLE, feature);
      }
    }

    // 9. Advanced features (addDirs + tokenLimit)
    await this.addAdvancedFeatures(options);

    // 10. Reasoning effort level
    this.addReasoningEffort(options);

    // 10b. Personality
    await this.addPersonality(options);

    // 11. Configuration
    if (options?.config) {
      if (typeof options.config === 'string') {
        this.args.push(CLI.FLAGS.CONFIG, options.config);
      } else {
        const configStr = Object.entries(options.config)
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        this.args.push(CLI.FLAGS.CONFIG, configStr);
      }
    }

    // 12. Profile
    if (options?.profile) {
      this.args.push(CLI.FLAGS.PROFILE, options.profile);
    }

    // 13. Images
    if (options?.image) {
      const images = Array.isArray(options.image) ? options.image : [options.image];
      for (const img of images) {
        this.args.push(CLI.FLAGS.IMAGE, img);
      }
    }

    // 14. Command mode (exec or exec resume)
    if (this.useResumeMode && options?.codexConversationId) {
      // Use "exec resume <session_id>" for non-interactive resume
      this.args.push('exec', CLI.FLAGS.RESUME, options.codexConversationId);
      Logger.debug(`Using exec resume mode with conversation ID: ${options.codexConversationId}`);
    } else if (options?.useExec !== false) {
      // Default to exec mode
      this.args.push('exec');
    }

    // 14b. OSS mode — must come AFTER exec (Codex CLI parses --oss as exec subcommand flag)
    if (options?.oss || options?.localProvider) {
      if (this.useResumeMode) {
        // exec resume has a limited flag set (no --oss/--local-provider).
        // Only set model_provider when localProvider is explicitly specified.
        if (options.localProvider) {
          this.args.push(CLI.FLAGS.CONFIG, `model_provider=${options.localProvider}`);
          Logger.debug(
            `Resume mode: using -c model_provider=${options.localProvider} (--oss not supported)`
          );
        } else {
          // oss: true without explicit localProvider — let resumed session keep its original provider
          Logger.debug(
            'Resume mode: oss enabled but no localProvider specified, using session defaults'
          );
        }
      } else {
        this.args.push(CLI.FLAGS.OSS);
        if (options?.localProvider) {
          this.args.push(CLI.FLAGS.LOCAL_PROVIDER, options.localProvider);
          Logger.debug(
            options?.oss
              ? `Using local provider: ${options.localProvider}`
              : `Auto-enabling --oss for localProvider: ${options.localProvider}`
          );
        }
      }
    }

    // 14c. Exec-subcommand flags — must come AFTER exec (Codex CLI parses these as exec options)
    await this.addSkipGitCheck(options);
    await this.addOutputSchema(options);
    await this.addOutputLastMessage(options);

    // 15. Handle prompt (concise mode, stdin for large prompts)
    return this.handlePrompt(prompt, options);
  }

  /**
   * Check if resume mode should be used
   */
  private async checkResumeMode(options?: CodexCommandBuilderOptions): Promise<void> {
    if (options?.codexConversationId) {
      const resumeSupported = await supportsResume();
      if (resumeSupported) {
        this.useResumeMode = true;
        Logger.debug('Resume mode enabled (Codex CLI v0.36.0+)');
      } else {
        Logger.warn(
          'Resume mode requested but not supported (requires Codex CLI v0.36.0+). Falling back to exec mode.'
        );
      }
    }
  }

  /**
   * Validate options for conflicts
   */
  private validateOptions(options?: CodexCommandBuilderOptions): void {
    if (options?.approvalPolicy && options?.yolo) {
      throw new Error('Cannot use both yolo and approvalPolicy');
    }
    if (options?.sandboxMode && options?.yolo) {
      throw new Error('Cannot use both yolo and sandboxMode');
    }
  }

  /**
   * Add model argument with fallback chain
   * @param model Requested model name
   * @param skipValidation When true (OSS/local mode), pass model as-is without fallback checks
   */
  private async addModelArg(model?: string, skipValidation?: boolean): Promise<void> {
    if (skipValidation) {
      if (model) {
        // OSS/local models (e.g. qwen3:8b, gemma3:4b) are not in MODELS constant —
        // pass them directly without validation or fallback.
        this.args.push(CLI.FLAGS.MODEL, model);
        Logger.debug(`Using local/OSS model: ${model}`);
      } else {
        // OSS mode without explicit model — don't inject OpenAI model,
        // let Codex CLI / local provider use its default
        Logger.debug('OSS/local mode: skipping model flag, using provider default');
      }
      return;
    }

    const selectedModel = await getModelWithFallback(model);
    this.args.push(CLI.FLAGS.MODEL, selectedModel);

    if (model && model !== selectedModel) {
      Logger.warn(`Requested model '${model}' not available, using fallback: '${selectedModel}'`);
    } else {
      Logger.debug(`Using model: ${selectedModel}`);
    }
  }

  /**
   * Add safety control arguments (yolo, fullAuto, approval, sandbox)
   */
  private addSafetyArgs(options?: CodexCommandBuilderOptions): void {
    if (options?.yolo) {
      this.args.push(CLI.FLAGS.YOLO);
    } else if (options?.fullAuto) {
      this.args.push(CLI.FLAGS.FULL_AUTO);
    } else {
      // Approval policy
      if (options?.approvalPolicy) {
        this.args.push(CLI.FLAGS.ASK_FOR_APPROVAL, options.approvalPolicy);
      } else if (options?.approval) {
        this.args.push(CLI.FLAGS.APPROVAL, options.approval);
      }

      // Sandbox mode
      if (options?.sandboxMode) {
        this.args.push(CLI.FLAGS.SANDBOX_MODE, options.sandboxMode);
      } else if (options?.search || options?.oss || options?.localProvider) {
        // Auto-enable workspace-write for search/oss/localProvider if no sandbox specified
        Logger.debug(
          'Search/OSS/localProvider enabled: auto-setting sandbox to workspace-write for network access'
        );
        this.args.push(CLI.FLAGS.SANDBOX_MODE, 'workspace-write');
      }
    }
  }

  /**
   * Add working directory argument
   */
  private addWorkingDir(options?: CodexCommandBuilderOptions, prompt?: string): void {
    const resolvedWorkingDir = resolveWorkingDirectory({
      workingDir: options?.workingDir || options?.cd,
      prompt: prompt,
    });

    if (resolvedWorkingDir) {
      // Store for spawn cwd
      this.resolvedWorkingDir = resolvedWorkingDir;
      // Use appropriate flag based on mode
      const flag = options?.cd !== undefined ? CLI.FLAGS.CD : CLI.FLAGS.WORKING_DIR;
      this.args.push(flag, resolvedWorkingDir);
      Logger.debug(`Resolved working directory: ${resolvedWorkingDir}`);
    }
  }

  /**
   * Add search and feature flags (shared 69-line logic from both functions)
   */
  private async addSearchAndFeatures(options?: CodexCommandBuilderOptions): Promise<void> {
    // Web Search - Dual-flag approach for backward compatibility (v1.3.0+)
    if (options?.search) {
      // Check if native --search flag is supported (Codex CLI v0.52.0+)
      const hasNativeSearch = await supportsNativeSearch();

      if (hasNativeSearch) {
        // Use native --search flag for newer versions
        this.args.push(CLI.FLAGS.SEARCH);
        Logger.debug('Using native --search flag (Codex CLI v0.52.0+)');
      } else {
        Logger.debug(
          'Native --search flag not supported, falling back to web_search_request feature flag'
        );
      }

      // Always add feature flag for backward compatibility
      const enableFeatures = [...(options?.enableFeatures || [])];
      if (!enableFeatures.includes('web_search_request')) {
        enableFeatures.push('web_search_request');
      }

      // Add all features to args
      for (const feature of enableFeatures) {
        this.args.push(CLI.FLAGS.ENABLE, feature);
      }
    } else {
      // Normal feature flag handling when search is not enabled
      const enableFeatures = [...(options?.enableFeatures || [])];
      for (const feature of enableFeatures) {
        this.args.push(CLI.FLAGS.ENABLE, feature);
      }
    }
  }

  /**
   * Add advanced features (addDirs, toolOutputTokenLimit)
   */
  private async addAdvancedFeatures(options?: CodexCommandBuilderOptions): Promise<void> {
    // Additional writable directories (v1.3.0+, requires Codex CLI v0.59.0+)
    if (options?.addDirs && Array.isArray(options.addDirs)) {
      const hasAddDir = await supportsAddDir();
      if (hasAddDir) {
        for (const dir of options.addDirs) {
          this.args.push(CLI.FLAGS.ADD_DIR, dir);
        }
        Logger.debug('Using --add-dir flag (Codex CLI v0.59.0+)');
      } else {
        Logger.warn(
          'Additional directories specified but --add-dir flag not supported (requires Codex CLI v0.59.0+). Ignoring addDirs parameter.'
        );
      }
    }

    // Tool output token limit (v1.3.0+, requires Codex CLI v0.59.0+)
    if (options?.toolOutputTokenLimit) {
      const hasTokenLimit = await supportsToolTokenLimit();
      if (hasTokenLimit) {
        this.args.push(CLI.FLAGS.CONFIG, `tool_output_token_limit=${options.toolOutputTokenLimit}`);
        Logger.debug('Using tool_output_token_limit config (Codex CLI v0.59.0+)');
      } else {
        Logger.warn(
          'Tool output token limit specified but not supported (requires Codex CLI v0.59.0+). Ignoring toolOutputTokenLimit parameter.'
        );
      }
    }
  }

  /**
   * Add reasoning effort level (low, medium, high, xhigh)
   * Note: 'none' and 'minimal' are accepted by Codex CLI parser but rejected by OpenAI API for gpt-5.3-codex
   */
  private addReasoningEffort(options?: CodexCommandBuilderOptions): void {
    if (options?.reasoningEffort) {
      const validEfforts = ['low', 'medium', 'high', 'xhigh'];
      if (validEfforts.includes(options.reasoningEffort)) {
        this.args.push(CLI.FLAGS.CONFIG, `model_reasoning_effort="${options.reasoningEffort}"`);
        Logger.debug(`Using reasoning effort: ${options.reasoningEffort}`);
      } else {
        Logger.warn(
          `Invalid reasoning effort '${options.reasoningEffort}'. Valid values: low, medium, high, xhigh`
        );
      }
    }
  }

  /**
   * Add --skip-git-repo-check flag (v0.75.0+)
   */
  private async addSkipGitCheck(options?: CodexCommandBuilderOptions): Promise<void> {
    if (options?.skipGitRepoCheck) {
      const hasFlag = await supportsSkipGitCheck();
      if (hasFlag) {
        this.args.push(CLI.FLAGS.SKIP_GIT_REPO_CHECK);
        Logger.debug('Using --skip-git-repo-check flag (Codex CLI v0.75.0+)');
      } else {
        Logger.warn(
          'Skip git repo check requested but not supported (requires Codex CLI v0.75.0+). Ignoring.'
        );
      }
    }
  }

  /**
   * Add personality configuration (v0.94.0+)
   */
  private async addPersonality(options?: CodexCommandBuilderOptions): Promise<void> {
    if (options?.personality) {
      const hasFlag = await supportsPersonality();
      if (hasFlag) {
        this.args.push(CLI.FLAGS.CONFIG, `personality="${options.personality}"`);
        Logger.debug(`Using personality: ${options.personality}`);
      } else {
        Logger.warn(
          `Personality config requested but not supported (requires Codex CLI v0.94.0+). Ignoring.`
        );
      }
    }
  }

  /**
   * Add --output-schema flag (v0.95.0+)
   * Accepts a file path (string) or inline schema (object → written to temp file)
   */
  private async addOutputSchema(options?: CodexCommandBuilderOptions): Promise<void> {
    if (!options?.outputSchema) return;

    const hasFlag = await supportsOutputSchema();
    if (!hasFlag) {
      Logger.warn(
        'Output schema requested but not supported (requires Codex CLI v0.95.0+). Ignoring.'
      );
      return;
    }

    if (typeof options.outputSchema === 'string') {
      // String → pass as file path directly
      this.args.push(CLI.FLAGS.OUTPUT_SCHEMA, options.outputSchema);
      Logger.debug(`Using output schema file: ${options.outputSchema}`);
    } else {
      // Object → write to temp file
      const tempFileName = `codex-schema-${randomBytes(8).toString('hex')}.json`;
      const tempFilePath = join(tmpdir(), tempFileName);
      try {
        writeFileSync(tempFilePath, JSON.stringify(options.outputSchema), 'utf8');
        this.args.push(CLI.FLAGS.OUTPUT_SCHEMA, tempFilePath);
        this.tempFiles.push(tempFilePath);
        Logger.debug(`Using output schema (written to temp file): ${tempFilePath}`);
      } catch (error) {
        Logger.warn(`Failed to write output schema to temp file: ${error}. Ignoring.`);
      }
    }
  }

  /**
   * Add -o / --output-last-message flag (v0.95.0+)
   */
  private async addOutputLastMessage(options?: CodexCommandBuilderOptions): Promise<void> {
    if (options?.outputLastMessage) {
      const hasFlag = await supportsOutputLastMessage();
      if (hasFlag) {
        this.args.push(CLI.FLAGS.OUTPUT_LAST_MESSAGE, options.outputLastMessage);
        Logger.debug(`Using output-last-message: ${options.outputLastMessage}`);
      } else {
        Logger.warn(
          'Output last message requested but not supported (requires Codex CLI v0.95.0+). Ignoring.'
        );
      }
    }
  }

  /**
   * Handle prompt with concise mode and stdin for large prompts
   */
  private handlePrompt(prompt: string, options?: CodexCommandBuilderOptions): BuildResult {
    let finalPrompt = prompt;

    // Add changeMode format instruction so Codex CLI outputs structured edits
    if (options?.changeMode) {
      finalPrompt =
        'IMPORTANT: Format ALL code changes using this exact structure for each edit:\n\n' +
        '**FILE: path/to/file.ts:LINE_NUMBER**\n' +
        '```\n' +
        'OLD:\n' +
        '[exact original code]\n' +
        'NEW:\n' +
        '[replacement code]\n' +
        '```\n\n' +
        'Provide one block per edit. Include the exact original code that should be replaced.\n\n' +
        finalPrompt;
      Logger.debug('Change mode enabled: prepended format instructions to prompt');
    }

    // Add conciseness instruction if requested
    if (options?.concisePrompt) {
      finalPrompt = `Please provide a focused, concise response without unnecessary elaboration. ${prompt}`;
    }

    // Check if prompt is too long for command line (OS dependent, ~100KB is safe)
    const MAX_COMMAND_LINE_LENGTH = 100000;
    const useStdin =
      options?.useStdinForLongPrompts !== false && finalPrompt.length > MAX_COMMAND_LINE_LENGTH;

    if (useStdin) {
      // Create temporary file for large prompts
      const tempFileName = `codex-prompt-${randomBytes(8).toString('hex')}.txt`;
      const tempFilePath = join(tmpdir(), tempFileName);

      try {
        writeFileSync(tempFilePath, finalPrompt, 'utf8');
        Logger.debug(
          `Prompt too long (${finalPrompt.length} chars), using temp file: ${tempFilePath}`
        );

        // Use stdin redirection via special prompt format
        this.args.push(`@${tempFilePath}`);
        this.tempFiles.push(tempFilePath);
      } catch (error) {
        Logger.warn(
          `Failed to create temp file for large prompt: ${error}. Proceeding with direct prompt.`
        );
        this.args.push(finalPrompt);
      }
    } else {
      // Normal prompt handling
      this.args.push(finalPrompt);
    }

    return {
      args: this.args,
      tempFiles: this.tempFiles,
      finalPrompt,
      useResume: this.useResumeMode,
      workingDir: this.resolvedWorkingDir,
    };
  }

  /**
   * Cleanup temporary file if created
   */
  static cleanupTempFile(tempFile: string): void {
    try {
      unlinkSync(tempFile);
      Logger.debug(`Cleaned up temp file: ${tempFile}`);
    } catch (error) {
      Logger.warn(`Failed to cleanup temp file ${tempFile}:`, error);
    }
  }
}
