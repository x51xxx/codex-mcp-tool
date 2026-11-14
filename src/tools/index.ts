// Tool Registry Index - Registers all tools
import { toolRegistry } from './registry.js';
import { askCodexTool } from './ask-codex.tool.js';
import { batchCodexTool } from './batch-codex.tool.js';
import { reviewCodexTool } from './review-codex.tool.js';
import { pingTool, helpTool, versionTool } from './simple-tools.js';
import { brainstormTool } from './brainstorm.tool.js';
import { fetchChunkTool } from './fetch-chunk.tool.js';
import { timeoutTestTool } from './timeout-test.tool.js';
import { listSessionsTool } from './list-sessions.tool.js';
import { healthTool } from './health.tool.js';
import { listSkillsTool } from './list-skills.tool.js';
import { doActTool } from './do-act.tool.js';
import { imageGenTool } from './image-gen.tool.js';

toolRegistry.push(
  askCodexTool,
  batchCodexTool,
  reviewCodexTool,
  pingTool,
  helpTool,
  versionTool,
  brainstormTool,
  fetchChunkTool,
  listSessionsTool,
  healthTool,
  listSkillsTool,
  doActTool,
  imageGenTool
);

// Diagnostic tool for exercising progress/keepalive handling; not useful to
// end users, so it is only exposed on request.
if (process.env['CODEX_MCP_TEST_TOOLS'] === '1') {
  toolRegistry.push(timeoutTestTool);
}

export * from './registry.js';
