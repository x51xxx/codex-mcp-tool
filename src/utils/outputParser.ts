import { Logger } from './logger.js';

// Response mode: clean = final answer only, full = complete execution log
export type ResponseMode = 'clean' | 'full';

// Codex Output Interface
export interface CodexOutput {
  metadata: {
    version?: string;
    workdir?: string;
    model?: string;
    provider?: string;
    approval?: string;
    sandbox?: string;
    reasoning_effort?: string;
    reasoning_summaries?: string;
    [key: string]: string | undefined;
  };
  userInstructions: string;
  thinking?: string;
  response: string;
  tokensUsed?: number;
  timestamps: string[];
  rawOutput: string;
  rawStderr?: string;
}

/**
 * Detect whether raw output contains Codex CLI section markers (interactive format).
 * Codex CLI v0.114.0+ sends interactive output (header, metadata, thinking, tool executions)
 * to stderr, while stdout contains only the clean final response.
 */
function hasInteractiveFormat(rawOutput: string): boolean {
  return rawOutput.includes('OpenAI Codex') || rawOutput.includes('--------');
}

export function parseCodexOutput(rawOutput: string, rawStderr?: string): CodexOutput {
  // Codex CLI v0.114.0+: stdout = clean response, stderr = interactive output.
  // If stdout has no section markers, treat it as the clean final response directly.
  if (!hasInteractiveFormat(rawOutput) && rawOutput.trim()) {
    // Extract tokens and metadata from stderr if available
    let tokensUsed: number | undefined;
    let metadata: any = {};
    if (rawStderr) {
      const tokensMatch = rawStderr.match(/tokens used[:\s]*(\d[\d\s]*\d|\d+)/);
      if (tokensMatch) {
        tokensUsed = parseInt(tokensMatch[1].replace(/\s/g, ''), 10);
      }
      // Parse metadata from stderr (interactive format)
      if (hasInteractiveFormat(rawStderr)) {
        const parsed = parseInteractiveOutput(rawStderr);
        metadata = parsed.metadata;
      }
    }

    const output: CodexOutput = {
      metadata,
      userInstructions: '',
      thinking: undefined,
      response: rawOutput.trim(),
      tokensUsed,
      timestamps: [],
      rawOutput,
      rawStderr,
    };

    Logger.codexResponse(output.response, tokensUsed);
    return output;
  }

  // Fallback: if stdout is empty but stderr has content, try stderr
  const effectiveOutput = rawOutput.trim() ? rawOutput : rawStderr || rawOutput;

  const parsed = parseInteractiveOutput(effectiveOutput);
  parsed.rawStderr = rawStderr;
  return parsed;
}

/**
 * Parse Codex CLI interactive output format (header + metadata + thinking + response).
 * Used for older CLI versions where everything goes to stdout,
 * or for parsing stderr in newer versions.
 */
function parseInteractiveOutput(rawOutput: string): CodexOutput {
  const lines = rawOutput.split('\n');
  const timestamps: string[] = [];
  let metadata: any = {};
  let userInstructions = '';
  let thinking = '';
  let response = '';
  let tokensUsed: number | undefined;

  let currentSection = 'header';
  let metadataLines: string[] = [];
  let thinkingLines: string[] = [];
  let responseLines: string[] = [];

  // Section marker patterns — must match ONLY standalone markers, not content lines.
  // Codex CLI uses these as speaker/action labels on their own line.
  const STANDALONE_MARKERS = /^(codex|assistant|user|exec|thinking)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Extract timestamps
    const timestampMatch = line.match(/^\[([^\]]+)\]/);
    if (timestampMatch) {
      timestamps.push(timestampMatch[1]);
    }

    // Extract tokens used (with or without colon, handle space-separated numbers like "7 951")
    const tokensMatch = line.match(/tokens used[:\s]*(\d[\d\s]*\d|\d+)/);
    if (tokensMatch) {
      tokensUsed = parseInt(tokensMatch[1].replace(/\s/g, ''), 10);
      continue;
    }

    // Identify sections by standalone markers and structural patterns
    if (line.includes('OpenAI Codex') || line.includes('Codex CLI')) {
      currentSection = 'header';
      continue;
    } else if (line.startsWith('--------')) {
      if (currentSection === 'header') {
        currentSection = 'metadata';
      } else if (currentSection === 'metadata') {
        currentSection = 'content';
      }
      continue;
    } else if (line.includes('User instructions:')) {
      currentSection = 'userInstructions';
      continue;
    } else if (trimmed === 'user') {
      // User prompt section — skip user's input
      currentSection = 'user';
      continue;
    } else if (trimmed === 'thinking') {
      currentSection = 'thinking';
      continue;
    } else if (trimmed === 'codex' || trimmed === 'assistant') {
      currentSection = 'response';
      continue;
    } else if (
      trimmed === 'exec' ||
      trimmed.startsWith('collab ') ||
      trimmed.startsWith('Plan ') ||
      trimmed.startsWith('mcp:') ||
      trimmed.startsWith('mcp startup:') ||
      trimmed.startsWith('spawn_agent(')
    ) {
      // Skip tool execution, collaboration, planning, and MCP lifecycle lines
      currentSection = 'exec';
      continue;
    }

    // Parse based on current section
    switch (currentSection) {
      case 'metadata':
        if (trimmed) {
          metadataLines.push(trimmed);
        }
        break;
      case 'userInstructions':
        if (trimmed && !line.includes('User instructions:')) {
          userInstructions += line + '\n';
        }
        break;
      case 'thinking':
        if (trimmed) {
          thinkingLines.push(line);
        }
        break;
      case 'response':
      case 'content':
        // Only filter standalone markers and token lines, not content containing keywords
        if (trimmed && !STANDALONE_MARKERS.test(trimmed)) {
          responseLines.push(line);
        }
        break;
      case 'user':
      case 'exec':
        // Skip user prompt and exec output lines
        break;
    }
  }

  // Parse metadata
  metadata = parseMetadata(metadataLines);
  thinking = thinkingLines.join('\n').trim();
  response = responseLines.join('\n').trim() || rawOutput; // Fallback to raw output if no response found
  userInstructions = userInstructions.trim();

  const output: CodexOutput = {
    metadata,
    userInstructions,
    thinking: thinking || undefined,
    response,
    tokensUsed,
    timestamps,
    rawOutput,
  };

  Logger.codexResponse(response, tokensUsed);
  return output;
}

function parseMetadata(metadataLines: string[]): any {
  const metadata: any = {};

  for (const line of metadataLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return metadata;
}

export function formatCodexResponse(
  output: CodexOutput,
  includeThinking: boolean = true,
  includeMetadata: boolean = true
): string {
  let formatted = '';

  // Add metadata summary if requested
  if (includeMetadata && (output.metadata.model || output.metadata.sandbox)) {
    formatted += `**Codex Configuration:**\n`;
    if (output.metadata.model) formatted += `- Model: ${output.metadata.model}\n`;
    if (output.metadata.sandbox) formatted += `- Sandbox: ${output.metadata.sandbox}\n`;
    if (output.metadata.approval) formatted += `- Approval: ${output.metadata.approval}\n`;
    formatted += '\n';
  }

  // Add thinking section if requested and available
  if (includeThinking && output.thinking) {
    formatted += `**Reasoning:**\n`;
    formatted += output.thinking + '\n\n';
  }

  // Add main response
  if (includeMetadata || includeThinking) {
    formatted += `**Response:**\n`;
  }
  formatted += output.response;

  // Add token usage if available
  if (output.tokensUsed) {
    formatted += `\n\n*Tokens used: ${output.tokensUsed}*`;
  }

  return formatted;
}

/**
 * Format full execution log from stderr (interactive output).
 * Shows the complete Codex CLI session: metadata, thinking, tool executions, and final response.
 */
export function formatCodexResponseFull(output: CodexOutput): string {
  const stderr = output.rawStderr || '';
  const stdout = output.rawOutput || '';

  if (!stderr.trim() && !stdout.trim()) {
    return '(empty response)';
  }

  let formatted = '';

  // Include metadata header
  if (output.metadata.model || output.metadata.sandbox) {
    formatted += `**Codex Configuration:**\n`;
    if (output.metadata.model) formatted += `- Model: ${output.metadata.model}\n`;
    if (output.metadata.sandbox) formatted += `- Sandbox: ${output.metadata.sandbox}\n`;
    if (output.metadata.approval) formatted += `- Approval: ${output.metadata.approval}\n`;
    if (output.metadata.reasoning_effort)
      formatted += `- Reasoning: ${output.metadata.reasoning_effort}\n`;
    formatted += '\n';
  }

  // Full execution log from stderr
  if (stderr.trim()) {
    formatted += `**Execution Log:**\n`;
    formatted += '```\n' + stderr.trim() + '\n```\n\n';
  }

  // Final response from stdout
  if (stdout.trim()) {
    formatted += `**Final Response:**\n`;
    formatted += stdout.trim();
  }

  // Token usage
  if (output.tokensUsed) {
    formatted += `\n\n*Tokens used: ${output.tokensUsed}*`;
  }

  return formatted;
}

export function formatCodexResponseForMCP(
  result: string,
  includeThinking: boolean = true,
  includeMetadata: boolean = true,
  stderr?: string,
  responseMode: ResponseMode = 'clean'
): string {
  // Try to parse the output first
  try {
    const parsed = parseCodexOutput(result, stderr);

    if (responseMode === 'full') {
      return formatCodexResponseFull(parsed);
    }

    return formatCodexResponse(parsed, includeThinking, includeMetadata);
  } catch {
    // If parsing fails, return the raw output (prefer non-empty source)
    if (responseMode === 'full' && stderr?.trim()) {
      return `**Execution Log:**\n\`\`\`\n${stderr.trim()}\n\`\`\`\n\n**Final Response:**\n${result.trim() || '(empty)'}`;
    }
    return result.trim() || stderr?.trim() || result;
  }
}

export function extractCodeBlocks(text: string): string[] {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = text.match(codeBlockRegex);
  return matches || [];
}

export function extractDiffBlocks(text: string): string[] {
  const diffRegex = /```diff[\s\S]*?```/g;
  const matches = text.match(diffRegex);
  return matches || [];
}

export function isErrorResponse(output: CodexOutput | string): boolean {
  const errorKeywords = [
    'error',
    'failed',
    'unable',
    'cannot',
    'authentication',
    'permission denied',
    'rate limit',
    'quota exceeded',
  ];

  const responseText =
    typeof output === 'string' ? output.toLowerCase() : output.response.toLowerCase();

  return errorKeywords.some(keyword => responseText.includes(keyword));
}
