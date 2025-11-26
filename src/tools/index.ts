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

toolRegistry.push(
  askCodexTool,
  batchCodexTool,
  reviewCodexTool,
  pingTool,
  helpTool,
  versionTool,
  brainstormTool,
  fetchChunkTool,
  timeoutTestTool,
  listSessionsTool,
  healthTool
);

export * from './registry.js';
