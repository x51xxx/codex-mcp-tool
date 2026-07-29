import { MODELS, MODEL_REASONING_EFFORTS, REASONING_EFFORTS } from '../constants.js';

/**
 * Lightweight model name validation.
 *
 * Model selection is delegated to Codex CLI: when no `-m` flag is passed,
 * `codex exec` applies the user's configured default from `~/.codex/config.toml`.
 * That removes the need for runtime availability probing (which previously
 * spawned a `codex exec -m <name> 'echo test'` per fallback candidate — slow
 * and quota-burning) and keeps a single source of truth for "which model".
 *
 * Tools should pass `model` only when the caller explicitly overrides the
 * default. For everything else, omit the flag entirely.
 */

/**
 * Validate if a user-specified model name is in our known MODELS list.
 *
 * Returning false does NOT mean the model is unusable — Codex CLI may accept
 * names we don't track (older releases, internal previews, OSS providers).
 * Use this only to emit a debug warning before passing the model through.
 */
export function isValidModel(modelName: string): boolean {
  const validModels = Object.values(MODELS) as string[];
  return validModels.includes(modelName);
}

/**
 * Reject a reasoning effort the selected model cannot serve.
 *
 * Only known models are checked. When the model is omitted the CLI config
 * decides which model runs, so there is nothing to validate against here and
 * the CLI stays the authority.
 *
 * Shared by `CodexCommandBuilder` and `review-changes`, which builds its own
 * argument list and would otherwise bypass this check.
 *
 * @throws Error when the pairing is known to be unsupported
 */
export function assertReasoningEffortSupported(model?: string, effort?: string): void {
  if (!model || !effort) return;

  const supported = MODEL_REASONING_EFFORTS[model];
  if (!supported || supported.includes(effort)) return;

  throw new Error(
    `Model '${model}' does not support reasoning effort '${effort}'. ` +
      `Supported for this model: ${supported.join(', ')}. ` +
      `(Highest levels — ${REASONING_EFFORTS.MAX}, ${REASONING_EFFORTS.ULTRA} — are GPT-5.6 options.)`
  );
}
