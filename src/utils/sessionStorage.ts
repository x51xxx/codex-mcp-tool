import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { Logger } from './logger.js';

/**
 * Session Storage for Codex MCP Tool
 * Provides workspace-isolated session management with native Codex resume support
 *
 * Features:
 * - Workspace isolation via MD5 hash (repo:head:path)
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
 * In-memory session storage
 */
const sessionStore = new Map<string, SessionData>();

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

  const existing = sessionStore.get(data.sessionId);
  const now = Date.now();

  const session: SessionData = {
    sessionId: data.sessionId,
    workspaceId: data.workspaceId || existing?.workspaceId || '',
    codexConversationId: data.codexConversationId || existing?.codexConversationId,
    lastPrompt: data.lastPrompt || existing?.lastPrompt || '',
    lastResponse: data.lastResponse || existing?.lastResponse || '',
    model: data.model || existing?.model,
    workingDir: data.workingDir || existing?.workingDir,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  sessionStore.set(data.sessionId, session);
  Logger.debug(`Saved session: ${data.sessionId} (workspace: ${session.workspaceId})`);

  return session;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): SessionData | null {
  const session = sessionStore.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if expired
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessionStore.delete(sessionId);
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
    const existing = getSession(sessionId);
    if (existing) {
      return existing;
    }
    // Create NEW session with requested ID (don't fall back to workspace!)
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
export function setCodexConversationId(sessionId: string, conversationId: string): void {
  const session = getSession(sessionId);
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
export function getCodexConversationId(sessionId: string): string | undefined {
  const session = getSession(sessionId);
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
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const deleted = sessionStore.delete(sessionId);
  if (deleted) {
    Logger.debug(`Deleted session: ${sessionId}`);
  }
  return deleted;
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
  const patterns = [
    /conversation\s*id\s*:\s*([a-zA-Z0-9-]+)/i,
    /conv(?:ersation)?[-_]?id\s*[=:]\s*([a-zA-Z0-9-]+)/i,
    /session\s*id\s*:\s*([a-zA-Z0-9-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
