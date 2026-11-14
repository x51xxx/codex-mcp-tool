import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { extractPathFromAtSyntax, resolveWorkingDirectory } from './workingDirResolver.js';

test('an invalid explicit workingDir throws instead of falling back', () => {
  assert.throws(
    () => resolveWorkingDirectory({ workingDir: '/no/such/dir-xyz' }),
    /Working directory does not exist/
  );
});

test('@path inference wins over PWD', () => {
  const root = mkdtempSync(join(tmpdir(), 'wd-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'src', 'a.ts'), '');
  const saved = process.env['CODEX_MCP_CWD'];
  delete process.env['CODEX_MCP_CWD'];
  try {
    assert.equal(resolveWorkingDirectory({ prompt: `explain @${root}/src/a.ts` }), root);
  } finally {
    if (saved !== undefined) process.env['CODEX_MCP_CWD'] = saved;
  }
});

test('e-mail-like text is not an @path reference', () => {
  assert.deepEqual(extractPathFromAtSyntax('mail user@host/path or pkg@scope/x', '/base'), []);
  assert.deepEqual(extractPathFromAtSyntax('see @src/a.ts', '/base'), [
    resolve('/base', 'src/a.ts'),
  ]);
});
