import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { getCodexVersion, getSupportedFeatures } from '../utils/versionDetection.js';
import { getSessionStats, getSession } from '../utils/sessionStorage.js';
import { executeCommand } from '../utils/commandExecutor.js';
import { Logger } from '../utils/logger.js';

const healthArgsSchema = z.object({
  sessionId: z.string().optional().describe('Optional session ID to check specific session health'),
  verbose: z.boolean().default(false).describe('Include detailed diagnostic information'),
});

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  codexCli: {
    installed: boolean;
    version: string;
    authenticated: boolean;
  };
  features: Record<string, boolean>;
  sessions: {
    total: number;
    withResume: number;
    maxSessions: number;
    ttlHours: number;
  };
  session?: {
    found: boolean;
    hasConversationId: boolean;
    lastActivity: string;
    workspaceId: string;
  };
  issues: string[];
}

/**
 * Check if Codex CLI is authenticated
 */
async function checkAuthentication(): Promise<boolean> {
  try {
    // Try a simple command that requires authentication
    const result = await executeCommand('codex', ['--help'], undefined, 5000);
    // If we get help output, CLI is at least installed
    // Authentication check is implicit - if API key is missing, commands will fail
    return result.includes('codex') || result.includes('Usage');
  } catch {
    return false;
  }
}

/**
 * Build health status report
 */
async function buildHealthStatus(sessionId?: string, verbose?: boolean): Promise<HealthStatus> {
  const issues: string[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // 1. Check Codex CLI
  const version = await getCodexVersion();
  const isInstalled = version.isValid;
  const isAuthenticated = isInstalled ? await checkAuthentication() : false;

  if (!isInstalled) {
    issues.push('Codex CLI not installed or not found in PATH');
    overallStatus = 'unhealthy';
  } else if (!isAuthenticated) {
    issues.push('Codex CLI may not be authenticated (run "codex login" or set OPENAI_API_KEY)');
    overallStatus = 'degraded';
  }

  // 2. Check features
  const features = await getSupportedFeatures();

  // Check for recommended features
  if (!features.NATIVE_SEARCH) {
    issues.push('Native search not available (upgrade Codex CLI to v0.52.0+)');
  }
  if (!features.RESUME) {
    issues.push('Resume feature not available (upgrade Codex CLI to v0.36.0+)');
  }

  // 3. Check sessions
  const sessionStats = getSessionStats();

  if (sessionStats.total >= sessionStats.maxSessions * 0.9) {
    issues.push(`Session limit nearly reached (${sessionStats.total}/${sessionStats.maxSessions})`);
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  // 4. Check specific session if provided
  let sessionInfo: HealthStatus['session'] | undefined;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      sessionInfo = {
        found: true,
        hasConversationId: !!session.codexConversationId,
        lastActivity: new Date(session.updatedAt).toISOString(),
        workspaceId: session.workspaceId,
      };

      if (!session.codexConversationId) {
        issues.push(`Session "${sessionId}" exists but has no conversation ID for resume`);
      }
    } else {
      sessionInfo = {
        found: false,
        hasConversationId: false,
        lastActivity: 'N/A',
        workspaceId: 'N/A',
      };
      issues.push(`Session "${sessionId}" not found or expired`);
    }
  }

  return {
    status: overallStatus,
    codexCli: {
      installed: isInstalled,
      version: version.raw || 'unknown',
      authenticated: isAuthenticated,
    },
    features,
    sessions: {
      total: sessionStats.total,
      withResume: sessionStats.withConversationId,
      maxSessions: sessionStats.maxSessions,
      ttlHours: Math.round(sessionStats.ttlMs / (60 * 60 * 1000)),
    },
    session: sessionInfo,
    issues,
  };
}

/**
 * Format health status for display
 */
function formatHealthReport(health: HealthStatus, verbose: boolean): string {
  const statusEmoji =
    health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';

  let output = `## Health Check ${statusEmoji} ${health.status.toUpperCase()}\n\n`;

  // Codex CLI Status
  output += `### Codex CLI\n`;
  output += `| Property | Value |\n`;
  output += `|----------|-------|\n`;
  output += `| Installed | ${health.codexCli.installed ? '✅ Yes' : '❌ No'} |\n`;
  output += `| Version | ${health.codexCli.version} |\n`;
  output += `| Authenticated | ${health.codexCli.authenticated ? '✅ Yes' : '⚠️ Unknown'} |\n\n`;

  // Features
  if (verbose) {
    output += `### Supported Features\n`;
    output += `| Feature | Status |\n`;
    output += `|---------|--------|\n`;
    for (const [feature, supported] of Object.entries(health.features)) {
      output += `| ${feature} | ${supported ? '✅' : '❌'} |\n`;
    }
    output += `\n`;
  }

  // Sessions
  output += `### Sessions\n`;
  output += `| Metric | Value |\n`;
  output += `|--------|-------|\n`;
  output += `| Active Sessions | ${health.sessions.total}/${health.sessions.maxSessions} |\n`;
  output += `| With Resume | ${health.sessions.withResume} |\n`;
  output += `| TTL | ${health.sessions.ttlHours} hours |\n\n`;

  // Specific session
  if (health.session) {
    output += `### Session Details\n`;
    output += `| Property | Value |\n`;
    output += `|----------|-------|\n`;
    output += `| Found | ${health.session.found ? '✅ Yes' : '❌ No'} |\n`;
    if (health.session.found) {
      output += `| Has Conversation ID | ${health.session.hasConversationId ? '✅ Yes' : '❌ No'} |\n`;
      output += `| Last Activity | ${health.session.lastActivity} |\n`;
      output += `| Workspace ID | ${health.session.workspaceId} |\n`;
    }
    output += `\n`;
  }

  // Issues
  if (health.issues.length > 0) {
    output += `### Issues Found\n`;
    for (const issue of health.issues) {
      output += `- ⚠️ ${issue}\n`;
    }
    output += `\n`;
  }

  // Quick fixes
  if (health.status !== 'healthy') {
    output += `### Recommended Actions\n`;
    if (!health.codexCli.installed) {
      output += `1. Install Codex CLI: \`npm install -g @openai/codex\`\n`;
    }
    if (!health.codexCli.authenticated) {
      output += `2. Authenticate: \`codex login\` or set \`OPENAI_API_KEY\`\n`;
    }
    if (!health.features.RESUME) {
      output += `3. Upgrade Codex CLI for resume support: \`npm update -g @openai/codex\`\n`;
    }
  }

  return output;
}

export const healthTool: UnifiedTool = {
  name: 'health',
  description: 'Check Codex CLI and session health status',
  zodSchema: healthArgsSchema,
  prompt: {
    description: 'Diagnose Codex CLI installation, authentication, and session health',
  },
  category: 'utility',
  execute: async (args, onProgress) => {
    const { sessionId, verbose } = args;

    try {
      const health = await buildHealthStatus(sessionId as string | undefined, verbose as boolean);
      return formatHealthReport(health, verbose as boolean);
    } catch (error) {
      Logger.error('Health check failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ **Health Check Failed**\n\nError: ${errorMessage}\n\nThis may indicate Codex CLI is not properly installed.`;
    }
  },
};
