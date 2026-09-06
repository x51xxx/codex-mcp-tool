import { CLI, APPROVAL_POLICIES } from '../constants.js';
import { Logger } from './logger.js';
import { resolveWorkingDirectory } from './workingDirResolver.js';
import { isValidModel, assertReasoningEffortSupported } from './modelDetection.js';
import { checkMinimumCodexVersion } from './versionDetection.js';
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
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
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
  readonly strictConfig?: boolean; // Fail on unknown config.toml fields
  readonly ephemeral?: boolean; // Do not persist session files
  readonly ignoreUserConfig?: boolean; // Ignore $CODEX_HOME/config.toml
  readonly ignoreRules?: boolean; // Ignore user/project execpolicy rules
  readonly bypassHookTrust?: boolean; // Run enabled hooks without persisted trust
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
  /** Prompt text to write to the child's stdin when `-` is used as the prompt. */
  stdinInput?: string;
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
    await this.assertSupportedCli();

    // 2. Check if we should use resume mode
    await this.checkResumeMode(options);

    // 3. Model selection with fallback (skip validation for OSS/local models)
    const isOssMode = !!(options?.oss || options?.localProvider);
    await this.addModelArg(options?.model, isOssMode);

    // 4. Safety controls (yolo, automation compatibility, approval, sandbox)
    this.addSafetyArgs(options);

    // 5. Working directory
    this.addWorkingDir(options, prompt);

    // 6. OSS flags are deferred to after exec (step 14b) —
    //    Codex CLI only applies --oss/--local-provider as exec subcommand flags.

    // 7. Search + Feature flags (shared 69-line logic)
    this.addSearchAndFeatures(options);

    // 8. Disable features
    if (options?.disableFeatures && Array.isArray(options.disableFeatures)) {
      for (const feature of options.disableFeatures) {
        this.args.push(CLI.FLAGS.DISABLE, feature);
      }
    }

    // 9. Advanced features (addDirs + tokenLimit)
    this.addAdvancedFeatures(options);

    // 10. Reasoning effort level
    this.addReasoningEffort(options);

    // 10b. Personality
    this.addPersonality(options);

    // 11. Configuration
    if (options?.config) {
      if (typeof options.config === 'string') {
        this.args.push(CLI.FLAGS.CONFIG, options.config);
      } else {
        this.addConfigObject(options.config);
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

    // 13b. Runtime validation/trust flags supported before or after exec.
    if (options?.strictConfig) {
      this.args.push(CLI.FLAGS.STRICT_CONFIG);
    }
    if (options?.bypassHookTrust) {
      this.args.push(CLI.FLAGS.BYPASS_HOOK_TRUST);
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
    this.addSkipGitCheck(options);
    this.addOutputSchema(options);
    this.addOutputLastMessage(options);
    this.addExecRuntimeArgs(options);

    // 15. Handle prompt (concise mode, stdin for large prompts)
    return this.handlePrompt(prompt, options);
  }

  /**
   * Fail fast on a Codex CLI older than the supported minimum.
   *
   * Previously each flag was gated individually and silently dropped on old
   * CLIs, which produced a run that looked successful but ignored half the
   * request. One explicit error is easier to act on.
   */
  private async assertSupportedCli(): Promise<void> {
    const check = await checkMinimumCodexVersion();
    if (!check.ok && check.message) {
      throw new Error(check.message);
    }
  }

  /**
   * Check if resume mode should be used
   */
  private async checkResumeMode(options?: CodexCommandBuilderOptions): Promise<void> {
    if (options?.codexConversationId) {
      this.useResumeMode = true;
      Logger.debug(`Resume mode enabled for conversation ${options.codexConversationId}`);
    }
  }

  /**
   * Validate options for conflicts
   */
  private validateOptions(options?: CodexCommandBuilderOptions): void {
    if (options?.approvalPolicy && options?.yolo) {
      throw new Error('Cannot use both yolo and approvalPolicy');
    }
    if (options?.approval && options?.yolo) {
      throw new Error('Cannot use both yolo and approval');
    }
    if (options?.sandboxMode && options?.yolo) {
      throw new Error('Cannot use both yolo and sandboxMode');
    }
    if (options?.fullAuto && (options?.approvalPolicy || options?.approval)) {
      throw new Error('Cannot combine fullAuto with an explicit approval policy');
    }

    // `approval` reaches the builder as a free-form string (ToolArguments types
    // it as `string`), so an unknown value would surface as a raw clap error
    // from the CLI. The removed `on-failure` and `untrusted` policies are the
    // likely offenders.
    const validPolicies = Object.values(APPROVAL_POLICIES) as string[];
    for (const [name, value] of [
      ['approvalPolicy', options?.approvalPolicy],
      ['approval', options?.approval],
    ] as const) {
      if (value && !validPolicies.includes(value)) {
        throw new Error(
          `Invalid ${name} '${value}'. Valid values: ${validPolicies.join(', ')}. ` +
            `('on-failure' and 'untrusted' were both removed from Codex CLI.)`
        );
      }
    }

    assertReasoningEffortSupported(options?.model, options?.reasoningEffort);
  }

  /**
   * Add model argument — only pushes -m when an explicit model is given.
   * When omitted, Codex CLI applies its own default from ~/.codex/config.toml.
   *
   * @param model Requested model name (optional)
   * @param skipValidation When true (OSS/local mode), pass model as-is without checks
   */
  private async addModelArg(model?: string, skipValidation?: boolean): Promise<void> {
    if (!model) {
      Logger.debug(
        skipValidation
          ? 'OSS/local mode: no model specified, deferring to provider default'
          : 'No model specified, deferring to Codex CLI config (~/.codex/config.toml)'
      );
      return;
    }

    if (skipValidation) {
      // OSS/local models (e.g. qwen3:8b, gemma3:4b) bypass MODELS validation.
      this.args.push(CLI.FLAGS.MODEL, model);
      Logger.debug(`Using local/OSS model: ${model}`);
      return;
    }

    if (!isValidModel(model)) {
      Logger.warn(`Model '${model}' not in known list — passing through to Codex CLI as-is`);
    }
    this.args.push(CLI.FLAGS.MODEL, model);
    Logger.debug(`Using model: ${model}`);
  }

  /**
   * Add safety control arguments.
   *
   * Codex CLI removed --full-auto and the on-failure/untrusted approval policies. Keep the
   * MCP compatibility option by expanding it to a writable sandbox with no
   * interactive approval prompts. This is not equivalent to --yolo: sandboxing
   * remains enabled and escalation failures are returned to the model.
   */
  private addSafetyArgs(options?: CodexCommandBuilderOptions): void {
    if (options?.yolo) {
      this.args.push(CLI.FLAGS.YOLO);
    } else if (options?.fullAuto) {
      this.args.push(CLI.FLAGS.SANDBOX_MODE, options?.sandboxMode || 'workspace-write');
      this.args.push(CLI.FLAGS.ASK_FOR_APPROVAL, 'never');
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
  private addSearchAndFeatures(options?: CodexCommandBuilderOptions): void {
    // Native --search is the only supported path. The former fallback to the
    // `web_search_request` feature flag is gone: that feature is reported as
    // `deprecated` by `codex features list`, and the branch was unreachable on
    // any CLI at or above the supported minimum.
    if (options?.search) {
      this.args.push(CLI.FLAGS.SEARCH);
      Logger.debug('Enabling native web search via --search');
    }

    for (const feature of options?.enableFeatures || []) {
      this.args.push(CLI.FLAGS.ENABLE, feature);
    }
  }

  /**
   * Add advanced features (addDirs, toolOutputTokenLimit)
   */
  private addAdvancedFeatures(options?: CodexCommandBuilderOptions): void {
    // Additional writable directories
    if (options?.addDirs && Array.isArray(options.addDirs)) {
      for (const dir of options.addDirs) {
        this.args.push(CLI.FLAGS.ADD_DIR, dir);
      }
    }

    // Tool output token limit
    if (options?.toolOutputTokenLimit) {
      this.args.push(CLI.FLAGS.CONFIG, `tool_output_token_limit=${options.toolOutputTokenLimit}`);
    }
  }

  /**
   * Add reasoning effort level. The selected model remains the source of truth
   * for whether max or ultra is available.
   */
  private addReasoningEffort(options?: CodexCommandBuilderOptions): void {
    if (options?.reasoningEffort) {
      const validEfforts = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
      if (validEfforts.includes(options.reasoningEffort)) {
        this.args.push(CLI.FLAGS.CONFIG, `model_reasoning_effort="${options.reasoningEffort}"`);
        Logger.debug(`Using reasoning effort: ${options.reasoningEffort}`);
      } else {
        Logger.warn(
          `Invalid reasoning effort '${options.reasoningEffort}'. Valid values: ${validEfforts.join(', ')}`
        );
      }
    }
  }

  /**
   * Add --skip-git-repo-check flag
   */
  private addSkipGitCheck(options?: CodexCommandBuilderOptions): void {
    if (options?.skipGitRepoCheck) {
      this.args.push(CLI.FLAGS.SKIP_GIT_REPO_CHECK);
    }
  }

  /**
   * Add personality configuration
   */
  private addPersonality(options?: CodexCommandBuilderOptions): void {
    if (options?.personality) {
      this.args.push(CLI.FLAGS.CONFIG, `personality="${options.personality}"`);
      Logger.debug(`Using personality: ${options.personality}`);
    }
  }

  /**
   * Add --output-schema flag
   * Accepts a file path (string) or inline schema (object → written to temp file)
   */
  private addOutputSchema(options?: CodexCommandBuilderOptions): void {
    if (!options?.outputSchema) return;

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
   * Add -o / --output-last-message flag
   */
  private addOutputLastMessage(options?: CodexCommandBuilderOptions): void {
    if (options?.outputLastMessage) {
      this.args.push(CLI.FLAGS.OUTPUT_LAST_MESSAGE, options.outputLastMessage);
      Logger.debug(`Using output-last-message: ${options.outputLastMessage}`);
    }
  }

  /**
   * Convert an object into repeatable `-c key=value` arguments. Codex expects
   * one override per flag; comma-joining multiple entries creates one invalid
   * TOML value. Nested objects become dotted configuration paths.
   */
  private addConfigObject(config: Record<string, any>, prefix: string = ''): void {
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) continue;

      const configKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.addConfigObject(value as Record<string, any>, configKey);
        continue;
      }

      this.args.push(CLI.FLAGS.CONFIG, `${configKey}=${this.formatTomlValue(value)}`);
    }
  }

  private formatTomlValue(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null) return '""';
    if (Array.isArray(value))
      return `[${value.map(item => this.formatTomlValue(item)).join(', ')}]`;
    return JSON.stringify(String(value));
  }

  /** Add flags that only exist on codex exec / codex exec resume. */
  private addExecRuntimeArgs(options?: CodexCommandBuilderOptions): void {
    if (options?.ephemeral) {
      this.args.push(CLI.FLAGS.EPHEMERAL);
    }
    if (options?.ignoreUserConfig) {
      this.args.push(CLI.FLAGS.IGNORE_USER_CONFIG);
    }
    if (options?.ignoreRules) {
      this.args.push(CLI.FLAGS.IGNORE_RULES);
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

    // Add conciseness instruction if requested. Must build on finalPrompt, not
    // the original prompt — interpolating `prompt` here would discard the
    // changeMode format instructions prepended just above, and changeMode would
    // silently parse zero edits.
    if (options?.concisePrompt) {
      finalPrompt = `Please provide a focused, concise response without unnecessary elaboration. ${finalPrompt}`;
    }

    // Large prompts are delivered over stdin rather than argv. Codex CLI reads
    // instructions from stdin when the prompt argument is `-`; that avoids both
    // the OS argv length limit (E2BIG) and any dependence on the agent choosing
    // to read a file for us.
    const MAX_COMMAND_LINE_LENGTH = 100000;
    const useStdin =
      options?.useStdinForLongPrompts !== false && finalPrompt.length > MAX_COMMAND_LINE_LENGTH;

    let stdinInput: string | undefined;

    if (useStdin) {
      stdinInput = finalPrompt;
      this.args.push('-');
      Logger.debug(`Prompt is ${finalPrompt.length} chars, sending it over stdin via '-'`);
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
      stdinInput,
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
