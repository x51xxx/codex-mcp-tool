import { CLI } from '../constants.js';
import { Logger } from './logger.js';
import { resolveWorkingDirectory } from './workingDirResolver.js';
import { getModelWithFallback } from './modelDetection.js';
import {
  supportsNativeSearch,
  supportsAddDir,
  supportsToolTokenLimit,
  supportsResume,
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
  readonly enableFeatures?: string[];
  readonly disableFeatures?: string[];
  readonly addDirs?: string[];
  readonly toolOutputTokenLimit?: number;
  readonly useExec?: boolean;
  readonly concisePrompt?: boolean;
  readonly useStdinForLongPrompts?: boolean;
  // Session/Resume support (v1.4.0+)
  readonly codexConversationId?: string; // Native Codex conversation ID for resume
}

/**
 * Result of building a Codex command
 */
export interface BuildResult {
  args: string[];
  tempFile?: string;
  finalPrompt: string;
  useResume: boolean; // Whether resume command is being used
}

/**
 * Builder class for constructing Codex CLI commands
 * Eliminates code duplication between executeCodexCLI and executeCodex
 */
export class CodexCommandBuilder {
  private args: string[] = [];
  private useResumeMode: boolean = false;

  /**
   * Build a complete Codex CLI command with all options
   * @param prompt User prompt
   * @param options Command options
   * @returns Build result with args, temp file, and final prompt
   */
  async build(prompt: string, options?: CodexCommandBuilderOptions): Promise<BuildResult> {
    this.args = []; // Reset args for fresh build
    this.useResumeMode = false;

    // 1. Validation
    this.validateOptions(options);

    // 2. Check if we should use resume mode
    await this.checkResumeMode(options);

    // 3. Model selection with fallback
    await this.addModelArg(options?.model);

    // 4. Safety controls (yolo, fullAuto, approval, sandbox)
    this.addSafetyArgs(options);

    // 5. Working directory
    this.addWorkingDir(options, prompt);

    // 6. OSS mode
    if (options?.oss) {
      this.args.push(CLI.FLAGS.OSS);
    }

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

    // 10. Configuration
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

    // 11. Profile
    if (options?.profile) {
      this.args.push(CLI.FLAGS.PROFILE, options.profile);
    }

    // 12. Images
    if (options?.image) {
      const images = Array.isArray(options.image) ? options.image : [options.image];
      for (const img of images) {
        this.args.push(CLI.FLAGS.IMAGE, img);
      }
    }

    // 13. Command mode (exec or exec resume)
    if (this.useResumeMode && options?.codexConversationId) {
      // Use "exec resume <session_id>" for non-interactive resume
      this.args.push('exec', CLI.FLAGS.RESUME, options.codexConversationId);
      Logger.debug(`Using exec resume mode with conversation ID: ${options.codexConversationId}`);
    } else if (options?.useExec !== false) {
      // Default to exec mode
      this.args.push('exec');
    }

    // 14. Handle prompt (concise mode, stdin for large prompts)
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
   */
  private async addModelArg(model?: string): Promise<void> {
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
      } else if (options?.search || options?.oss) {
        // Auto-enable workspace-write for search/oss if no sandbox specified
        Logger.debug(
          'Search/OSS enabled: auto-setting sandbox to workspace-write for network access'
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
   * Handle prompt with concise mode and stdin for large prompts
   */
  private handlePrompt(prompt: string, options?: CodexCommandBuilderOptions): BuildResult {
    let finalPrompt = prompt;
    let tempFile: string | undefined;

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
        tempFile = tempFilePath;
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
      tempFile,
      finalPrompt,
      useResume: this.useResumeMode,
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
