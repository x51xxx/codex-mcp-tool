import { z } from 'zod';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { executeCommand } from '../utils/commandExecutor.js';

const pingArgsSchema = z.object({
  prompt: z.string().default('').describe('Message to echo '),
});

export const pingTool: UnifiedTool = {
  name: 'ping',
  description: 'Echo',
  zodSchema: pingArgsSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  prompt: {
    description: 'Echo test message with structured response.',
  },
  category: 'simple',
  execute: async (args, onProgress) => {
    const message = args.prompt || args.message || 'Pong!';
    // Return message directly to avoid cross-platform issues with echo command
    return message as string;
  },
};

const helpArgsSchema = z.object({});

export const helpTool: UnifiedTool = {
  name: 'Help',
  description: 'receive help information',
  zodSchema: helpArgsSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  prompt: {
    description: 'receive help information',
  },
  category: 'simple',
  execute: async (args, onProgress) => {
    return executeCommand('codex', ['--help'], onProgress);
  },
};

const versionArgsSchema = z.object({});

export const versionTool: UnifiedTool = {
  name: 'version',
  description: 'Display version and system information',
  zodSchema: versionArgsSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  outputSchema: {
    type: 'object',
    properties: {
      codexCli: { type: 'string' },
      nodeJs: { type: 'string' },
      platform: { type: 'string' },
      mcpServer: { type: 'string' },
    },
    required: ['nodeJs', 'platform', 'mcpServer'],
  },
  prompt: {
    description: 'Get version information for Codex CLI and MCP server',
  },
  category: 'simple',
  execute: async (args, onProgress) => {
    const nodeVersion = process.version;
    const platform = process.platform;
    const mcpServer = '@trishchuk/codex-mcp-tool v2.1.0';

    try {
      const codexVersion = await executeCommand('codex', ['--version'], onProgress);
      const text = `**System Information:**
- Codex CLI: ${codexVersion.trim()}
- Node.js: ${nodeVersion}
- Platform: ${platform}
- MCP Server: ${mcpServer}`;

      return {
        text,
        structuredContent: {
          codexCli: codexVersion.trim(),
          nodeJs: nodeVersion,
          platform,
          mcpServer,
        },
      } as StructuredToolResult;
    } catch (error) {
      const text = `**System Information:**
- Codex CLI: Not installed or not accessible
- Node.js: ${nodeVersion}
- Platform: ${platform}
- MCP Server: ${mcpServer}

*Note: Install Codex CLI with: npm install -g @openai/codex*`;

      return {
        text,
        structuredContent: {
          codexCli: 'not installed',
          nodeJs: nodeVersion,
          platform,
          mcpServer,
        },
      } as StructuredToolResult;
    }
  },
};
