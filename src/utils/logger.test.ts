import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from './logger.js';

test('no log level writes to stdout (it carries the MCP JSON-RPC stream)', () => {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout: unknown[] = [];
  const stderr: unknown[] = [];
  console.log = (...a: unknown[]) => void stdout.push(a);
  console.error = (...a: unknown[]) => void stderr.push(a);
  const previous = Logger.getLevel();
  try {
    Logger.setLevel('debug');
    Logger.debug('d');
    Logger.log('i');
    Logger.warn('w');
    Logger.error('e');
    Logger.toolInvocation('ask-codex', { prompt: 'x'.repeat(5000) });
  } finally {
    console.log = originalLog;
    console.error = originalError;
    Logger.setLevel(previous);
  }
  assert.equal(stdout.length, 0);
  assert.equal(stderr.length, 5);
  assert.ok(String((stderr[4] as unknown[])[0]).length < 1000, 'tool args are truncated');
});

test('command lines are not logged at the default level', () => {
  const originalError = console.error;
  const lines: unknown[] = [];
  console.error = (...a: unknown[]) => void lines.push(a);
  try {
    Logger.setLevel('warning');
    Logger.commandExecution('codex', ['exec', '--', 'secret prompt'], Date.now());
  } finally {
    console.error = originalError;
  }
  assert.equal(lines.length, 0);
});
