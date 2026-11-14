import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { CodexCommandBuilder } from './codexCommandBuilder.js';

const workingDir = tmpdir();

async function build(prompt: string, options: Record<string, unknown> = {}) {
  return new CodexCommandBuilder().build(prompt, { workingDir, ...options });
}

test('the prompt follows `--`, so a leading dash is not parsed as a flag', async () => {
  const { args } = await build('- fix A\n- fix B');
  assert.deepEqual(args.slice(-2), ['--', '- fix A\n- fix B']);
});

test('prompts over 100 KB of UTF-8 go over stdin even when under 100k characters', async () => {
  const prompt = 'ї'.repeat(60_000); // 60k chars, 120 KB
  const { args, stdinInput } = await build(prompt);
  assert.deepEqual(args.slice(-2), ['--', '-']);
  assert.equal(stdinInput, prompt);
});

test('short prompts stay on argv', async () => {
  const { args, stdinInput } = await build('hello');
  assert.equal(stdinInput, undefined);
  assert.equal(args[args.length - 1], 'hello');
});

test('resume puts the conversation id before `--` and the prompt', async () => {
  const { args } = await build('next', {
    codexConversationId: '01a1dae8-f77e-7000-8000-000000000000',
  });
  const i = args.indexOf('resume');
  assert.ok(i > 0);
  assert.equal(args[i - 1], 'exec');
  assert.deepEqual(args.slice(-2), ['--', 'next']);
});

test('a conversation id that looks like a flag is rejected', async () => {
  await assert.rejects(
    build('x', { codexConversationId: '--help' }),
    /Invalid Codex conversation ID/
  );
});

test('fullAuto and yolo cannot be combined', async () => {
  await assert.rejects(build('x', { fullAuto: true, yolo: true }), /yolo and fullAuto/);
});

test('an explicit workingDir that does not exist is an error', async () => {
  await assert.rejects(
    new CodexCommandBuilder().build('x', { workingDir: '/definitely/not/here-xyz' }),
    /Working directory does not exist/
  );
});
