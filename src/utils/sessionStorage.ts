import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { Logger } from './logger.js';

/**
 * Session Storage for Codex MCP Tool
 * Provides workspace-isolated session management with native Codex resume support
 *
 * Features:
 * - Sessions keyed by (working directory, sessionId): the same sessionId in two
 *   directories is two independent conversations
 * - Workspace hash (repo:head:path) for the no-sessionId fallback
 * - Native Codex conversation ID storage for resume
 * - Configurable TTL via CODEX_SESSION_TTL_MS
 * - Aggressive cleanup (max 50 sessions)
 */

// Configuration from environment
const SESSION_TTL_MS = parseInt(process.env.CODEX_SESSION_TTL_MS || '', 10) || 24 * 60 * 60 * 1000; // 24 hours default
const MAX_SESSIONS = parseInt(process.env.CODEX_MAX_SESSIONS || '', 10) || 50;

/**
 * Session data structure
 */
export interface SessionData {
  sessionId: string;
  workspaceId: string; // MD5 hash for workspace isolation
  codexConversationId?: string; // Native Codex conversation ID for resume
  lastPrompt: string;
  lastResponse: string;
  model?: string;
  workingDir?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-memory session storage, keyed by `storeKey(sessionId, workingDir)`.
 *
 * Keyed by sessionId alone, a sessionId reused in a second directory had to
 * either resume the first directory's conversation (a leak) or replace it (the
 * first conversation silently lost). With the directory in the key both live
 * side by side.
 */
const sessionStore = new Map<string, SessionData>();

function storeKey(sessionId: string, workingDir?: string): string {
  return workingDir ? `${resolve(workingDir)}\u0000${sessionId}` : sessionId;
}

function keyOfSession(session: SessionData): string {
  return storeKey(session.sessionId, session.workingDir);
}

function isExpired(session: SessionData): boolean {
  return Date.now() - session.updatedAt > SESSION_TTL_MS;
}

/**
 * Find git root directory by walking up the tree
 */
function findGitRoot(startPath: string): string | null {
  let currentPath = startPath;

  // Limit search depth to prevent infinite loops
  for (let i = 0; i < 20; i++) {
    const gitPath = join(currentPath, '.git');
    if (existsSync(gitPath)) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached filesystem root
      break;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Read git HEAD content for workspace identification
 */
function readGitHead(gitRoot: string | null): string {
  if (!gitRoot) return '';

  try {
    const headPath = join(gitRoot, '.git', 'HEAD');
    if (existsSync(headPath)) {
      return readFileSync(headPath, 'utf8').trim();
    }
  } catch (error) {
    Logger.debug('Failed to read git HEAD:', error);
  }

  return '';
}

/**
 * Generate workspace ID using MD5 hash
 * Format: repo:head:path -> 12-char hex
 */
export function generateWorkspaceId(workingDir: string): string {
  const gitRoot = findGitRoot(workingDir);
  const repoName = basename(gitRoot || workingDir);
  const headContent = readGitHead(gitRoot);

  const hashInput = `${repoName}:${headContent}:${workingDir}`;
  return createHash('md5').update(hashInput).digest('hex').substring(0, 12);
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ses_${timestamp}_${random}`;
}

/**
 * Clean up expired sessions and enforce max limit
 */
function cleanupSessions(): void {
  const now = Date.now();
  const expiredIds: string[] = [];

  // Find expired sessions
  for (const [id, session] of sessionStore.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      expiredIds.push(id);
    }
  }

  // Remove expired
  for (const id of expiredIds) {
    sessionStore.delete(id);
    Logger.debug(`Cleaned up expired session: ${id}`);
  }

  // Enforce max limit - remove oldest if over limit
  if (sessionStore.size > MAX_SESSIONS) {
    const sessions = Array.from(sessionStore.entries()).sort(
      ([, a], [, b]) => a.updatedAt - b.updatedAt
    );

    const toRemove = sessions.slice(0, sessionStore.size - MAX_SESSIONS);
    for (const [id] of toRemove) {
      sessionStore.delete(id);
      Logger.debug(`Cleaned up oldest session (over limit): ${id}`);
    }
  }
}

/**
 * Save or update a session
 */
export function saveSession(data: Partial<SessionData> & { sessionId: string }): SessionData {
  cleanupSessions();

  const key = storeKey(data.sessionId, data.workingDir);
  const existing = sessionStore.get(key);
  const now = Date.now();

  const session: SessionData = {
    sessionId: data.sessionId,
    workspaceId: data.workspaceId || existing?.workspaceId || '',
    codexConversationId: data.codexConversationId || existing?.codexConversationId,
    lastPrompt: data.lastPrompt || existing?.lastPrompt || '',
    lastResponse: data.lastResponse || existing?.lastResponse || '',
    model: data.model || existing?.model,
    workingDir: data.workingDir ? resolve(data.workingDir) : existing?.workingDir,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  sessionStore.set(key, session);
  Logger.debug(`Saved session: ${data.sessionId} (workspace: ${session.workspaceId})`);

  return session;
}

/**
 * Get a session by ID.
 *
 * With `workingDir`, returns that directory's session only. Without it (e.g.
 * `health sessionId:x`), returns the most recently used session with that ID
 * in any directory.
 */
export function getSession(sessionId: string, workingDir?: string): SessionData | null {
  let session: SessionData | null = null;

  if (workingDir) {
    session = sessionStore.get(storeKey(sessionId, workingDir)) ?? null;
  } else {
    for (const candidate of sessionStore.values()) {
      if (
        candidate.sessionId === sessionId &&
        (!session || candidate.updatedAt > session.updatedAt)
      ) {
        session = candidate;
      }
    }
  }

  if (!session) {
    return null;
  }

  if (isExpired(session)) {
    sessionStore.delete(keyOfSession(session));
    Logger.debug(`Session expired: ${sessionId}`);
    return null;
  }

  return session;
}

/**
 * Get session by workspace ID (returns most recent)
 */
export function getSessionByWorkspace(workspaceId: string): SessionData | null {
  cleanupSessions();

  let mostRecent: SessionData | null = null;

  for (const session of sessionStore.values()) {
    if (session.workspaceId === workspaceId) {
      if (!mostRecent || session.updatedAt > mostRecent.updatedAt) {
        mostRecent = session;
      }
    }
  }

  return mostRecent;
}

/**
 * Get or create session for a workspace
 *
 * When sessionId is provided: returns existing session or creates new with that ID
 * When sessionId is NOT provided: returns workspace session or creates new with generated ID
 */
export function getOrCreateSession(workingDir: string, sessionId?: string): SessionData {
  const workspaceId = generateWorkspaceId(workingDir);

  // If sessionId provided explicitly - honor it
  if (sessionId) {
    // Looked up by directory, not workspaceId: workspaceId hashes .git/HEAD, so
    // a branch switch between turns would look like another workspace and drop
    // the conversation. A sessionId used in another directory is a separate
    // entry, so neither conversation resumes or replaces the other.
    const existing = getSession(sessionId, workingDir);
    if (existing) {
      return existing;
    }
    return saveSession({
      sessionId,
      workspaceId,
      workingDir,
      lastPrompt: '',
      lastResponse: '',
    });
  }

  // No sessionId provided - try workspace fallback
  const workspaceSession = getSessionByWorkspace(workspaceId);
  if (workspaceSession) {
    return workspaceSession;
  }

  // Generate new session ID
  return saveSession({
    sessionId: generateSessionId(),
    workspaceId,
    workingDir,
    lastPrompt: '',
    lastResponse: '',
  });
}

/**
 * Update session with Codex conversation ID (for native resume)
 */
export function setCodexConversationId(
  sessionId: string,
  conversationId: string,
  workingDir?: string
): void {
  const session = getSession(sessionId, workingDir);
  if (session) {
    saveSession({
      ...session,
      codexConversationId: conversationId,
    });
    Logger.debug(`Set Codex conversation ID for session ${sessionId}: ${conversationId}`);
  }
}

/**
 * Get Codex conversation ID for resume
 */
export function getCodexConversationId(sessionId: string, workingDir?: string): string | undefined {
  const session = getSession(sessionId, workingDir);
  return session?.codexConversationId;
}

/**
 * List all active sessions
 */
export function listSessions(): SessionData[] {
  cleanupSessions();
  return Array.from(sessionStore.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Delete a session. With `workingDir`, only that directory's session;
 * without it, every session with this ID. Returns how many were removed.
 */
export function deleteSession(sessionId: string, workingDir?: string): number {
  let removed = 0;
  if (workingDir) {
    removed = sessionStore.delete(storeKey(sessionId, workingDir)) ? 1 : 0;
  } else {
    for (const [key, session] of sessionStore.entries()) {
      if (session.sessionId === sessionId) {
        sessionStore.delete(key);
        removed++;
      }
    }
  }
  if (removed) {
    Logger.debug(`Deleted ${removed} session(s): ${sessionId}`);
  }
  return removed;
}

/**
 * Clear all sessions
 */
export function clearAllSessions(): void {
  const count = sessionStore.size;
  sessionStore.clear();
  Logger.debug(`Cleared all ${count} sessions`);
}

/**
 * Get session statistics
 */
export function getSessionStats(): {
  total: number;
  withConversationId: number;
  maxSessions: number;
  ttlMs: number;
} {
  cleanupSessions();

  let withConversationId = 0;
  for (const session of sessionStore.values()) {
    if (session.codexConversationId) {
      withConversationId++;
    }
  }

  return {
    total: sessionStore.size,
    withConversationId,
    maxSessions: MAX_SESSIONS,
    ttlMs: SESSION_TTL_MS,
  };
}

/**
 * Parse Codex conversation ID from stderr output
 * Pattern: "conversation id: abc123" or "Conversation ID: abc-123-def"
 */
export function parseConversationIdFromOutput(output: string): string | null {
  // Anchored to a whole line: Codex prints `session id: <uuid>` in its stderr
  // banner, and an unanchored match could pick up the same words from the
  // model's answer or an echoed prompt.
  const patterns = [
    /^\s*session\s*id\s*:\s*([0-9a-fA-F][0-9a-fA-F-]{7,})\s*$/im,
    /^\s*conversation\s*id\s*:\s*([0-9a-fA-F][0-9a-fA-F-]{7,})\s*$/im,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
