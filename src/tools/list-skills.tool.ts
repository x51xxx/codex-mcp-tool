import { z } from 'zod';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { Logger } from '../utils/logger.js';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const listSkillsArgsSchema = z.object({
  workingDir: z
    .string()
    .optional()
    .describe('Working directory to search for skills. Defaults to resolved working directory.'),
});

interface SkillInfo {
  name: string;
  description: string;
  path: string;
  scope: 'project' | 'user';
}

/**
 * Directories Codex loads skills from: the project's `.agents/skills` and
 * `.codex/skills`, then the user's `$CODEX_HOME/skills` and `~/.agents/skills`.
 * Only the first was scanned before, so user-level skills never showed up.
 */
function skillRoots(baseDir: string): Array<{ dir: string; scope: SkillInfo['scope'] }> {
  const codexHome = process.env['CODEX_HOME'] || join(homedir(), '.codex');
  return [
    { dir: join(baseDir, '.agents', 'skills'), scope: 'project' },
    { dir: join(baseDir, '.codex', 'skills'), scope: 'project' },
    { dir: join(codexHome, 'skills'), scope: 'user' },
    { dir: join(homedir(), '.agents', 'skills'), scope: 'user' },
  ];
}

/**
 * Description from a SKILL.md: the `description:` field of its YAML
 * frontmatter, else the first non-heading line after the frontmatter.
 */
export function extractSkillDescription(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === '---') {
    for (i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
      const match = lines[i].match(/^description:\s*(.*)$/);
      if (match) {
        const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
        if (value && value !== '|' && value !== '>') return value;
        // Block scalar: take the indented lines that follow.
        const block: string[] = [];
        for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
          block.push(lines[j].trim());
        }
        if (block.length) return block.join(' ');
      }
    }
    i++; // skip the closing ---
  }
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith('#')) return trimmed;
  }
  return undefined;
}

function discoverSkills(baseDir: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  for (const { dir, scope } of skillRoots(baseDir)) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      Logger.warn(`Failed to read skills directory ${dir}: ${err}`);
      continue;
    }

    for (const entry of entries) {
      // A project skill shadows a user skill of the same name.
      if (entry.startsWith('.') || seen.has(entry)) continue;
      const skillPath = join(dir, entry);
      try {
        if (!statSync(skillPath).isDirectory()) continue;
      } catch {
        continue; // dangling symlink
      }

      const skillMdPath = join(skillPath, 'SKILL.md');
      let description = 'No description available';
      if (existsSync(skillMdPath)) {
        try {
          description = extractSkillDescription(readFileSync(skillMdPath, 'utf8')) ?? description;
        } catch (err) {
          Logger.warn(`Failed to read ${skillMdPath}: ${err}`);
        }
      }

      seen.add(entry);
      skills.push({ name: entry, description, path: skillPath, scope });
    }
  }

  return skills;
}

function tableCell(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Format skills list for display
 */
function formatSkillsList(skills: SkillInfo[], baseDir: string): string {
  const searched = skillRoots(baseDir)
    .map(r => `\`${r.dir}\``)
    .join(', ');
  if (skills.length === 0) {
    return `## Skills Discovery

No skills found. Searched: ${searched}

To create a skill, add a directory under \`.agents/skills/\` with a \`SKILL.md\` file.
Use skills in prompts with the \`$skill-name\` syntax.`;
  }

  let output = `## Available Skills (${skills.length})\n\n`;
  output += `| Skill | Scope | Description |\n`;
  output += `|-------|-------|-------------|\n`;

  for (const skill of skills) {
    output += `| \`$${skill.name}\` | ${skill.scope} | ${tableCell(skill.description)} |\n`;
  }

  output += `\nSearched: ${searched}`;
  output += `\nUse skills in prompts with the \`$skill-name\` syntax.`;

  return output;
}

export const listSkillsTool: UnifiedTool = {
  name: 'list-skills',
  description:
    'Discover available Codex skills: project .agents/skills and .codex/skills, plus user $CODEX_HOME/skills and ~/.agents/skills',
  zodSchema: listSkillsArgsSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      skills: { type: 'array' },
      baseDir: { type: 'string' },
      error: { type: 'string' },
    },
    required: ['skills', 'baseDir'],
  },
  prompt: {
    description: 'List available Codex skills in the current project',
  },
  category: 'utility',
  execute: async (args, onProgress) => {
    const { workingDir } = args;

    const resolvedDir = resolveWorkingDirectory({
      workingDir: workingDir as string | undefined,
    });

    const baseDir = resolvedDir || process.cwd();

    try {
      const skills = discoverSkills(baseDir);
      const text = formatSkillsList(skills, baseDir);
      return {
        text,
        structuredContent: {
          skills: skills.map(s => ({
            name: s.name,
            description: s.description,
            path: s.path,
            scope: s.scope,
          })),
          baseDir,
        },
      } as StructuredToolResult;
    } catch (error) {
      Logger.error('Skills discovery failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Keep the failure inside the declared outputSchema.
      return {
        text: `❌ **Skills Discovery Failed**\n\nError: ${errorMessage}`,
        structuredContent: { skills: [], baseDir, error: errorMessage },
      } as StructuredToolResult;
    }
  },
};
