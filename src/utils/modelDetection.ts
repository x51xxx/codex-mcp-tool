import { MODELS } from '../constants.js';

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
