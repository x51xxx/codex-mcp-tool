import { Logger } from './logger.js';
import { executeCommand } from './commandExecutor.js';

/**
 * Codex CLI version detection and feature compatibility checks
 * Ensures correct CLI flags are used based on installed version
 */

export interface CodexVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
  isValid: boolean;
}

/**
 * Feature availability by version
 */
export const FEATURE_VERSIONS = {
  NATIVE_SEARCH: { major: 0, minor: 52, patch: 0 }, // --search flag
  TOOL_TOKEN_LIMIT: { major: 0, minor: 59, patch: 0 }, // tool_output_token_limit
  ADD_DIR: { major: 0, minor: 59, patch: 0 }, // --add-dir flag
  WINDOWS_AGENT: { major: 0, minor: 59, patch: 0 }, // Windows agent mode
  GPT5_1_MODELS: { major: 0, minor: 56, patch: 0 }, // GPT-5.1 model family
} as const;

/**
 * Parse version string into structured format
 * @param versionString Raw version string (e.g., "0.59.0", "v0.52.1")
 * @returns CodexVersion object
 */
export function parseVersion(versionString: string): CodexVersion {
  // Remove 'v' prefix if present
  const cleanVersion = versionString.replace(/^v/, '').trim();

  // Match semantic version pattern
  const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      raw: versionString,
      isValid: false,
    };
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: versionString,
    isValid: true,
  };
}

/**
 * Compare two versions
 * @returns number Negative if v1 < v2, 0 if equal, positive if v1 > v2
 */
export function compareVersions(
  v1: CodexVersion,
  v2: { major: number; minor: number; patch: number }
): number {
  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  return v1.patch - v2.patch;
}

/**
 * Check if version meets minimum requirement
 * @param version Current version
 * @param minVersion Minimum required version
 * @returns boolean True if version >= minVersion
 */
export function meetsMinVersion(
  version: CodexVersion,
  minVersion: { major: number; minor: number; patch: number }
): boolean {
  if (!version.isValid) {
    Logger.warn('Invalid version format, assuming feature not available');
    return false;
  }

  return compareVersions(version, minVersion) >= 0;
}

/**
 * Get installed Codex CLI version
 * @returns Promise<CodexVersion> Version information
 */
export async function getCodexVersion(): Promise<CodexVersion> {
  try {
    const versionOutput = await executeCommand('codex', ['--version'], undefined, 5000);

    // Parse version from output (format: "codex 0.59.0" or just "0.59.0")
    const versionMatch =
      versionOutput.match(/codex\s+v?(\d+\.\d+\.\d+)/) || versionOutput.match(/v?(\d+\.\d+\.\d+)/);

    if (!versionMatch) {
      Logger.warn('Could not parse Codex version from output:', versionOutput);
      return {
        major: 0,
        minor: 0,
        patch: 0,
        raw: versionOutput,
        isValid: false,
      };
    }

    const version = parseVersion(versionMatch[1]);
    Logger.log(`Detected Codex CLI version: ${version.major}.${version.minor}.${version.patch}`);
    return version;
  } catch (error) {
    Logger.error('Failed to get Codex CLI version:', error);
    return {
      major: 0,
      minor: 0,
      patch: 0,
      raw: 'unknown',
      isValid: false,
    };
  }
}

/**
 * Check if specific feature is available in installed version
 * @param featureName Name of feature from FEATURE_VERSIONS
 * @returns Promise<boolean> True if feature is available
 */
export async function isFeatureAvailable(
  featureName: keyof typeof FEATURE_VERSIONS
): Promise<boolean> {
  const version = await getCodexVersion();
  const minVersion = FEATURE_VERSIONS[featureName];

  return meetsMinVersion(version, minVersion);
}

/**
 * Check if native --search flag is available
 * @returns Promise<boolean> True if --search flag is supported
 */
export async function supportsNativeSearch(): Promise<boolean> {
  return await isFeatureAvailable('NATIVE_SEARCH');
}

/**
 * Check if --add-dir flag is available
 * @returns Promise<boolean> True if --add-dir flag is supported
 */
export async function supportsAddDir(): Promise<boolean> {
  return await isFeatureAvailable('ADD_DIR');
}

/**
 * Check if tool_output_token_limit config is available
 * @returns Promise<boolean> True if token limit config is supported
 */
export async function supportsToolTokenLimit(): Promise<boolean> {
  return await isFeatureAvailable('TOOL_TOKEN_LIMIT');
}

/**
 * Check if GPT-5.1 models are available
 * @returns Promise<boolean> True if GPT-5.1 models are supported
 */
export async function supportsGPT51Models(): Promise<boolean> {
  return await isFeatureAvailable('GPT5_1_MODELS');
}

/**
 * Get all supported features for current version
 * @returns Promise<Record<string, boolean>> Map of feature names to availability
 */
export async function getSupportedFeatures(): Promise<Record<string, boolean>> {
  const version = await getCodexVersion();

  const features: Record<string, boolean> = {};
  for (const [featureName, minVersion] of Object.entries(FEATURE_VERSIONS)) {
    features[featureName] = meetsMinVersion(version, minVersion);
  }

  return features;
}

/**
 * Log version and feature support information
 */
export async function logVersionInfo(): Promise<void> {
  const version = await getCodexVersion();
  const features = await getSupportedFeatures();

  Logger.log(`Codex CLI Version: ${version.raw}`);
  Logger.log('Supported Features:');
  for (const [feature, supported] of Object.entries(features)) {
    Logger.log(`  ${feature}: ${supported ? '✓' : '✗'}`);
  }
}
