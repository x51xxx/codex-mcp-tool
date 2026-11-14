#!/usr/bin/env node
// Runs every compiled `*.test.js` under dist/ with the built-in test runner.
// Listing the files here instead of passing a glob keeps `npm test` working on
// Node 18/20 (no glob support in `node --test`) and under Windows cmd (where
// quoted globs reach node literally); `node --test dist/` would also pick up
// unrelated files such as `test-tool.example.d.ts`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return collect(path);
    return name.endsWith('.test.js') ? [path] : [];
  });
}

const files = collect('dist').sort();
if (files.length === 0) {
  console.error('No compiled tests found under dist/ — run `npm run build` first.');
  process.exit(1);
}
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
