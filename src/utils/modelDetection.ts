import { MODELS } from '../constants.js';
import { Logger } from './logger.js';
import { executeCommand } from './commandExecutor.js';

/**
 * Model availability detection and fallback chain
 * Ensures compatibility with different Codex CLI versions and user access levels
 */

export interface ModelInfo {
  name: string;
  available: boolean;
  isDefault: boolean;
  priority: number;
}

/**
 * Model availability cache with TTL to reduce CLI calls
 */
interface ModelCacheEntry {
  available: boolean;
  timestamp: number;
}

const modelAvailabilityCache = new Map<string, ModelCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Priority-ordered fallback chain for default model selection
 */
const DEFAULT_MODEL_FALLBACK: string[] = [
  MODELS.GPT5_1_CODEX_MAX, // Highest priority: Latest frontier model
  MODELS.GPT5_CODEX, // Fallback: Previous default
  MODELS.GPT5, // Ultimate fallback: Base GPT-5
];

/**
 * Check if a specific model is available via Codex CLI
 *
 * This function performs a real availability check by attempting to execute
 * a minimal test prompt with the specified model. Results are cached for 5 minutes
 * to reduce unnecessary CLI calls.
 *
 * @param modelName Model identifier to check (e.g., 'gpt-5.1-codex-max')
 * @param bypassCache If true, ignores cache and forces fresh check
 * @returns Promise<boolean> True if model is available and working
 */
export async function isModelAvailable(
  modelName: string,
  bypassCache: boolean = false
): Promise<boolean> {
  // Check cache first (unless bypassed)
  if (!bypassCache) {
    const cached = modelAvailabilityCache.get(modelName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      Logger.debug(`Using cached availability for model ${modelName}: ${cached.available}`);
      return cached.available;
    }
  }

  try {
    // Strategy 1: Try to execute a minimal test prompt with the model
    // This is the most reliable way to check if model is truly available
    Logger.debug(`Testing model availability: ${modelName}`);

    try {
      // Attempt a very quick test with the model (5 second timeout)
      await executeCommand('codex', ['exec', '-m', modelName, 'echo test'], undefined, 5000);

      Logger.debug(`Model ${modelName} is available (test execution succeeded)`);

      // Cache positive result
      modelAvailabilityCache.set(modelName, {
        available: true,
        timestamp: Date.now(),
      });

      return true;
    } catch (testError) {
      // If test execution failed, check if Codex CLI itself is working
      Logger.debug(`Model test failed for ${modelName}, checking Codex CLI availability`);

      // Strategy 2: Fallback - check if Codex CLI is installed at all
      await executeCommand('codex', ['--version'], undefined, 3000);

      // If we reach here, Codex CLI works but model might not be available
      // This could mean: model doesn't exist, user doesn't have access, or model name is wrong
      Logger.warn(
        `Model ${modelName} test execution failed but Codex CLI is working. Model may not be available or accessible.`
      );

      // Cache negative result (shorter TTL for potentially transient failures)
      modelAvailabilityCache.set(modelName, {
        available: false,
        timestamp: Date.now(),
      });

      return false;
    }
  } catch (error) {
    // Complete failure - Codex CLI is not working at all
    Logger.warn(`Codex CLI availability check failed for ${modelName}:`, error);

    // Don't cache complete CLI failures as they might be transient
    return false;
  }
}

/**
 * Get the best available default model using fallback chain
 * @returns Promise<string> The best available model name
 */
export async function getDefaultModel(): Promise<string> {
  Logger.log('Detecting best available default model...');

  // Try each model in priority order
  for (const modelName of DEFAULT_MODEL_FALLBACK) {
    try {
      const available = await isModelAvailable(modelName);

      if (available) {
        Logger.log(`Selected default model: ${modelName}`);
        return modelName;
      }
    } catch (error) {
      Logger.warn(`Failed to check model ${modelName}:`, error);
      continue;
    }
  }

  // Ultimate fallback if all checks fail
  Logger.warn(`All default models unavailable, falling back to ${MODELS.GPT5_CODEX}`);
  return MODELS.GPT5_CODEX;
}

/**
 * Validate if a user-specified model name is valid
 * @param modelName User-provided model name
 * @returns boolean True if model name exists in MODELS constant
 */
export function isValidModel(modelName: string): boolean {
  const validModels = Object.values(MODELS) as string[];
  return validModels.includes(modelName);
}

/**
 * Get model name with fallback to default
 * @param requestedModel User-requested model (optional)
 * @returns Promise<string> Model name to use
 */
export async function getModelWithFallback(requestedModel?: string): Promise<string> {
  // If no model requested, use default
  if (!requestedModel) {
    return await getDefaultModel();
  }

  // Validate requested model
  if (!isValidModel(requestedModel)) {
    Logger.warn(`Invalid model "${requestedModel}", falling back to default`);
    return await getDefaultModel();
  }

  // Check if requested model is available
  const available = await isModelAvailable(requestedModel);
  if (!available) {
    Logger.warn(`Model "${requestedModel}" not available, falling back to default`);
    return await getDefaultModel();
  }

  return requestedModel;
}

/**
 * Get all available models (for future use in model listing)
 * @returns Promise<string[]> Array of available model names
 */
export async function getAvailableModels(): Promise<string[]> {
  const availableModels: string[] = [];

  for (const modelName of Object.values(MODELS)) {
    try {
      const available = await isModelAvailable(modelName);
      if (available) {
        availableModels.push(modelName);
      }
    } catch (error) {
      // Skip unavailable models
      continue;
    }
  }

  return availableModels;
}
