import { z } from 'zod';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { Logger } from '../utils/logger.js';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

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
}

/**
 * Discover skills from .agents/skills/ directory
 */
function discoverSkills(baseDir: string): SkillInfo[] {
  const skillsDir = join(baseDir, '.agents', 'skills');

  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    return [];
  }

  const skills: SkillInfo[] = [];

  try {
    const entries = readdirSync(skillsDir);

    for (const entry of entries) {
      const skillPath = join(skillsDir, entry);
      if (!statSync(skillPath).isDirectory()) continue;

      const skillMdPath = join(skillPath, 'SKILL.md');
      let description = 'No description available';

      if (existsSync(skillMdPath)) {
        try {
          const content = readFileSync(skillMdPath, 'utf8');
          // Extract first non-empty, non-heading line as description
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              description = trimmed;
              break;
            }
          }
        } catch (err) {
          Logger.warn(`Failed to read ${skillMdPath}: ${err}`);
        }
      }

      skills.push({
        name: entry,
        description,
        path: skillPath,
      });
    }
  } catch (err) {
    Logger.error(`Failed to read skills directory: ${err}`);
  }

  return skills;
}

/**
 * Format skills list for display
 */
function formatSkillsList(skills: SkillInfo[], baseDir: string): string {
  if (skills.length === 0) {
    return `## Skills Discovery

No skills found in \`${baseDir}/.agents/skills/\`

To create a skill, add a directory under \`.agents/skills/\` with a \`SKILL.md\` file.
Use skills in prompts with the \`$skill-name\` syntax.`;
  }

  let output = `## Available Skills (${skills.length})\n\n`;
  output += `| Skill | Description |\n`;
  output += `|-------|-------------|\n`;

  for (const skill of skills) {
    output += `| \`$${skill.name}\` | ${skill.description} |\n`;
  }

  output += `\nSkills directory: \`${baseDir}/.agents/skills/\``;
  output += `\nUse skills in prompts with the \`$skill-name\` syntax.`;

  return output;
}

export const listSkillsTool: UnifiedTool = {
  name: 'list-skills',
  description: 'Discover available Codex skills from .agents/skills/ directory',
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
          skills: skills.map(s => ({ name: s.name, description: s.description, path: s.path })),
          baseDir,
        },
      } as StructuredToolResult;
    } catch (error) {
      Logger.error('Skills discovery failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `❌ **Skills Discovery Failed**\n\nError: ${errorMessage}`;
    }
  },
};
