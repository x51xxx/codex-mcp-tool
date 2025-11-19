import { existsSync, statSync } from 'fs';
import { dirname, resolve, isAbsolute } from 'path';
import { Logger } from './logger.js';

/**
 * Project marker files that indicate the root of a project directory
 */
const PROJECT_MARKERS = [
  'package.json', // Node.js/JavaScript
  '.git', // Git repository
  'pyproject.toml', // Python
  'Cargo.toml', // Rust
  'go.mod', // Go
  'pom.xml', // Java (Maven)
  'build.gradle', // Java (Gradle)
  'composer.json', // PHP
] as const;

/**
 * Maximum levels to walk up the directory tree when searching for project root
 */
const MAX_WALK_UP_LEVELS = 10;

/**
 * Find the project root directory by walking up the directory tree
 * looking for common project marker files.
 *
 * @param startPath - The directory or file path to start searching from
 * @returns The project root directory, or the starting directory if no markers found
 */
export function findProjectRoot(startPath: string): string {
  try {
    // Ensure we start from a directory, not a file
    let currentDir = ensureDirectory(startPath);
    if (!currentDir) {
      Logger.debug(`findProjectRoot: Invalid start path: ${startPath}`);
      return startPath;
    }

    // Walk up the directory tree looking for project markers
    let levelsWalked = 0;
    while (levelsWalked < MAX_WALK_UP_LEVELS) {
      Logger.debug(`Checking for project markers in: ${currentDir}`);

      // Check if any project marker exists in current directory
      for (const marker of PROJECT_MARKERS) {
        const markerPath = resolve(currentDir, marker);
        if (existsSync(markerPath)) {
          Logger.debug(`Found project root at: ${currentDir} (marker: ${marker})`);
          return currentDir;
        }
      }

      // Move up one directory
      const parentDir = dirname(currentDir);

      // Stop if we've reached the root directory
      if (parentDir === currentDir) {
        Logger.debug(`Reached filesystem root, using: ${currentDir}`);
        break;
      }

      currentDir = parentDir;
      levelsWalked++;
    }

    // If no markers found, return the starting directory
    Logger.debug(`No project markers found, using start directory: ${currentDir}`);
    return ensureDirectory(startPath) || startPath;
  } catch (error) {
    Logger.debug(`Error in findProjectRoot: ${error}`);
    return startPath;
  }
}

/**
 * Ensures that the provided path points to a directory.
 * If the path is a file, returns its parent directory.
 * If the path doesn't exist or is invalid, returns undefined.
 * Supports both absolute and relative paths.
 *
 * @param path - The file or directory path (absolute or relative)
 * @param baseDir - Base directory for resolving relative paths (default: process.cwd())
 * @returns The directory path, or undefined if invalid
 */
export function ensureDirectory(
  path?: string,
  baseDir: string = process.cwd()
): string | undefined {
  if (!path) {
    return undefined;
  }

  try {
    // Resolve to absolute path if relative
    const absolutePath = isAbsolute(path) ? path : resolve(baseDir, path);
    Logger.debug(`Resolving path: ${path} -> ${absolutePath} (base: ${baseDir})`);

    // Check if path exists
    if (!existsSync(absolutePath)) {
      Logger.debug(`Path does not exist: ${absolutePath}`);
      return undefined;
    }

    // Get file stats
    const stats = statSync(absolutePath);

    // If it's a directory, return as-is
    if (stats.isDirectory()) {
      return absolutePath;
    }

    // If it's a file, return its parent directory
    if (stats.isFile()) {
      const parentDir = dirname(absolutePath);
      Logger.debug(`Path is a file, using parent directory: ${parentDir}`);
      return parentDir;
    }

    // If it's neither file nor directory (symlink, etc.), try to resolve
    Logger.debug(`Path is neither file nor directory: ${absolutePath}`);
    return undefined;
  } catch (error) {
    Logger.debug(`Error in ensureDirectory: ${error}`);
    return undefined;
  }
}

/**
 * Extract file paths from @path syntax in the prompt.
 * Supports both quoted and unquoted paths, absolute and relative.
 *
 * Examples:
 * - @/absolute/path/to/file.ts (absolute)
 * - @./relative/path/to/file.ts (relative)
 * - @src/file.ts (relative)
 * - @"path with spaces/file.ts" (quoted, can be absolute or relative)
 * - @'path with spaces/file.ts' (quoted, can be absolute or relative)
 *
 * @param prompt - The user prompt that may contain @path references
 * @param baseDir - Base directory for resolving relative paths (default: process.cwd())
 * @returns Array of absolute paths found in the prompt
 */
export function extractPathFromAtSyntax(prompt: string, baseDir: string = process.cwd()): string[] {
  const paths: string[] = [];

  // Pattern 1: Quoted paths with @ prefix: @"path" or @'path'
  const quotedPathRegex = /@["']([^"']+)["']/g;
  let match;

  while ((match = quotedPathRegex.exec(prompt)) !== null) {
    const path = match[1];
    // Convert to absolute if relative
    const absolutePath = isAbsolute(path) ? path : resolve(baseDir, path);
    paths.push(absolutePath);
    Logger.debug(`Extracted quoted @path: ${path} -> ${absolutePath}`);
  }

  // Pattern 2: Unquoted absolute paths: @/path
  const absolutePathRegex = /@(\/[^\s"']+)/g;

  while ((match = absolutePathRegex.exec(prompt)) !== null) {
    const path = match[1];
    paths.push(path);
    Logger.debug(`Extracted absolute @path: ${path}`);
  }

  // Pattern 3: Unquoted relative paths: @./path or @../path or @word/path
  const relativePathRegex = /@(\.{1,2}\/[^\s"']+|[a-zA-Z0-9_-]+\/[^\s"']+)/g;

  while ((match = relativePathRegex.exec(prompt)) !== null) {
    const path = match[1];
    const absolutePath = resolve(baseDir, path);
    paths.push(absolutePath);
    Logger.debug(`Extracted relative @path: ${path} -> ${absolutePath}`);
  }

  Logger.debug(`Extracted ${paths.length} paths from @syntax: ${paths.join(', ')}`);
  return paths;
}

/**
 * Resolve the working directory using a fallback chain with multiple strategies.
 *
 * Priority order (highest to lowest):
 * 1. Explicit workingDir parameter
 * 2. Environment variables: CODEX_MCP_CWD > PWD > INIT_CWD
 * 3. Automatic inference from @path syntax in prompt
 * 4. process.cwd() as last resort
 *
 * @param options - Resolution options
 * @returns The resolved working directory path
 */
export function resolveWorkingDirectory(options?: {
  workingDir?: string;
  prompt?: string;
}): string | undefined {
  const { workingDir, prompt } = options || {};

  // Get a base directory for resolving relative paths
  const baseDir =
    process.env['CODEX_MCP_CWD'] || process.env['PWD'] || process.env['INIT_CWD'] || process.cwd();

  // Priority 1: Explicit workingDir parameter
  if (workingDir) {
    const validDir = ensureDirectory(workingDir, baseDir);
    if (validDir) {
      Logger.debug(`Using explicit working directory: ${validDir}`);
      return validDir;
    } else {
      Logger.warn(`Explicit workingDir is invalid: ${workingDir}`);
    }
  }

  // Priority 2: Environment variables
  const envVars = ['CODEX_MCP_CWD', 'PWD', 'INIT_CWD'] as const;
  for (const envVar of envVars) {
    const envValue = process.env[envVar];
    if (envValue) {
      const validDir = ensureDirectory(envValue, process.cwd());
      if (validDir) {
        Logger.debug(`Using environment variable ${envVar}: ${validDir}`);
        return validDir;
      } else {
        Logger.debug(`Environment variable ${envVar} is invalid: ${envValue}`);
      }
    }
  }

  // Priority 3: Automatic inference from @path syntax
  if (prompt) {
    const paths = extractPathFromAtSyntax(prompt, baseDir);

    for (const path of paths) {
      if (existsSync(path)) {
        // Find the project root for this path
        const projectRoot = findProjectRoot(path);
        if (projectRoot) {
          Logger.debug(`Inferred working directory from @path syntax: ${projectRoot}`);
          return projectRoot;
        }
      }
    }
  }

  // Priority 4: process.cwd() as fallback
  const cwd = process.cwd();
  Logger.debug(`Using process.cwd() as working directory: ${cwd}`);
  return cwd;
}
