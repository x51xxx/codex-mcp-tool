import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import {
  listSessions,
  getSessionStats,
  deleteSession,
  clearAllSessions,
} from '../utils/sessionStorage.js';

const listSessionsArgsSchema = z.object({
  action: z
    .enum(['list', 'delete', 'clear'])
    .default('list')
    .describe('Action: list (default), delete (single session), clear (all sessions)'),
  sessionId: z.string().optional().describe('Session ID for delete action'),
});

/**
 * Format session data for display
 */
function formatSessionsList(): string {
  const sessions = listSessions();
  const stats = getSessionStats();

  if (sessions.length === 0) {
    return `**No active sessions**

Session Configuration:
- Max sessions: ${stats.maxSessions}
- TTL: ${Math.round(stats.ttlMs / (60 * 60 * 1000))} hours

Tip: Use \`sessionId\` parameter in \`ask-codex\` to start a new session.`;
  }

  let output = `## Active Sessions (${sessions.length}/${stats.maxSessions})\n\n`;
  output += `| Session ID | Workspace | Last Activity | Has Resume |\n`;
  output += `|------------|-----------|---------------|------------|\n`;

  for (const session of sessions) {
    const lastActivity = new Date(session.updatedAt).toLocaleString();
    const hasResume = session.codexConversationId ? '✅' : '❌';
    const workspaceShort = session.workspaceId.substring(0, 8);

    output += `| \`${session.sessionId.substring(0, 16)}...\` | ${workspaceShort} | ${lastActivity} | ${hasResume} |\n`;
  }

  output += `\n**Statistics:**\n`;
  output += `- Total sessions: ${stats.total}\n`;
  output += `- With resume capability: ${stats.withConversationId}\n`;
  output += `- TTL: ${Math.round(stats.ttlMs / (60 * 60 * 1000))} hours\n`;

  return output;
}

export const listSessionsTool: UnifiedTool = {
  name: 'list-sessions',
  description: 'List all active conversation sessions with metadata, or manage sessions',
  zodSchema: listSessionsArgsSchema,
  prompt: {
    description: 'View and manage active Codex sessions',
  },
  category: 'utility',
  execute: async (args, onProgress) => {
    const { action, sessionId } = args;

    switch (action) {
      case 'delete':
        if (!sessionId) {
          return '❌ **Error**: Session ID required for delete action.\n\nUsage: `list-sessions action:delete sessionId:<session-id>`';
        }
        const deleted = deleteSession(sessionId as string);
        if (deleted) {
          return `✅ Session \`${sessionId}\` deleted successfully.`;
        } else {
          return `❌ Session \`${sessionId}\` not found or already expired.`;
        }

      case 'clear':
        clearAllSessions();
        return '✅ All sessions cleared.';

      case 'list':
      default:
        return formatSessionsList();
    }
  },
};
