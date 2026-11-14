import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChangeModeOutput } from './changeModeParser.js';
import { parseCodexOutput } from './outputParser.js';
import { extractSkillDescription } from '../tools/list-skills.tool.js';

test('a longer fence keeps ``` inside NEW: as part of the edit', () => {
  const out = [
    '**FILE: README.md:3**',
    '````',
    'OLD:',
    'old line',
    'NEW:',
    '```js',
    'code()',
    '```',
    '````',
  ].join('\n');
  const [edit] = parseChangeModeOutput(out);
  assert.equal(edit.newCode, '```js\ncode()\n```');
});

test('an answer with a markdown rule is not mistaken for the interactive transcript', () => {
  const answer = 'Summary\n\n--------\n\n| a | b |\n|---|---|\nOpenAI Codex is mentioned here.';
  assert.equal(parseCodexOutput(answer, '').response, answer);
});

test('skill descriptions come from YAML frontmatter', () => {
  assert.equal(
    extractSkillDescription('---\nname: x\ndescription: Does X.\n---\n# X\nBody'),
    'Does X.'
  );
  assert.equal(extractSkillDescription('---\nname: x\n---\n# Title\nFirst line.'), 'First line.');
  assert.equal(extractSkillDescription('# T\n\nPlain.'), 'Plain.');
});
