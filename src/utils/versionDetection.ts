import { Logger } from './logger.js';
import { executeCommand } from './commandExecutor.js';

/**
 * Codex CLI version detection.
 *
 * This server used to gate individual flags behind per-feature version
 * thresholds. Every threshold sat below `0.98.0` while shipped Codex CLI is
 * well past `0.145.0`, so all of them were permanently true: dead branches that
 * still cost an async check (and potentially a `codex --version` spawn) on
 * every command build.
 *
 * They are replaced by a single minimum supported version. Below it the server
 * fails fast with an actionable message instead of silently dropping flags,
 * which previously turned an unsupported CLI into a confusing partial run.
 */

export interface CodexVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
  isValid: boolean;
}

/**
 * Minimum Codex CLI version this server supports.
 *
 * Derived from the highest threshold in the previous per-feature table
 * (`--output-schema` / `-o`, recorded as `0.95.0`); those recorded thresholds
 * are inherited, not independently verified. What *is* verified is that every
 * flag this server emits works on `0.145.0`.
 */
export const MINIMUM_CODEX_VERSION = { major: 0, minor: 95, patch: 0 } as const;
export const MINIMUM_CODEX_VERSION_STRING = '0.95.0';

// Version cache for performance optimization
let cachedVersion: CodexVersion | null = null;
let cacheTimestamp = 0;
const VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Parse version string into structured format
 * @param versionString Raw version string (e.g., "0.145.0", "v0.145.0")
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
 * Get installed Codex CLI version (with caching)
 * @param bypassCache If true, forces fresh version check
 * @returns Promise<CodexVersion> Version information
 */
export async function getCodexVersion(bypassCache: boolean = false): Promise<CodexVersion> {
  // Return cached version if valid
  if (!bypassCache && cachedVersion && Date.now() - cacheTimestamp < VERSION_CACHE_TTL) {
    Logger.debug(`Using cached Codex version: ${cachedVersion.raw}`);
    return cachedVersion;
  }

  try {
    const versionOutput = await executeCommand('codex', ['--version'], undefined, 5000);

    // Codex CLI prints "codex-cli 0.145.0"; older builds printed "codex 0.59.0".
    // The optional `-cli` suffix matters — without it only the bare-number
    // fallback matched, which would also happily match a version-like string
    // anywhere in the output.
    const versionMatch =
      versionOutput.match(/codex(?:-cli)?\s+v?(\d+\.\d+\.\d+)/i) ||
      versionOutput.match(/v?(\d+\.\d+\.\d+)/);

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

    // Cache the version
    cachedVersion = version;
    cacheTimestamp = Date.now();

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

export interface MinimumVersionCheck {
  ok: boolean;
  version: CodexVersion;
  /** Populated only when the check fails. */
  message?: string;
}

/**
 * Check the installed CLI against {@link MINIMUM_CODEX_VERSION}.
 *
 * An unparseable version is treated as acceptable: the server should not refuse
 * to run because it could not read a version string. A genuinely broken
 * installation surfaces through the binary resolution and spawn paths instead.
 */
export async function checkMinimumCodexVersion(): Promise<MinimumVersionCheck> {
  const version = await getCodexVersion();

  if (!version.isValid) {
    Logger.debug('Codex CLI version could not be determined; skipping minimum version check');
    return { ok: true, version };
  }

  if (meetsMinVersion(version, MINIMUM_CODEX_VERSION)) {
    return { ok: true, version };
  }

  return {
    ok: false,
    version,
    message:
      `Codex CLI ${version.major}.${version.minor}.${version.patch} is older than the minimum ` +
      `supported version ${MINIMUM_CODEX_VERSION_STRING}. Upgrade with: npm install -g @openai/codex@latest`,
  };
}

/**
 * Clear version cache (useful for testing)
 */
export function clearVersionCache(): void {
  cachedVersion = null;
  cacheTimestamp = 0;
}
